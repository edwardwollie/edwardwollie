"""Deterministic indexed triangle meshes for the game and blueprint renderer.

All vertices, indices, normals and vertex colors written to blueprint-spec.json
are consumed directly by Babylon and by the offline blueprint camera.

Internally every primitive is authored with the mathematical convention that
(b-a) x (c-a) points out of the surface. Babylon's default left-handed scene
treats the opposite winding as the front face, so build() swaps the last two
indices of every triangle on output. The renderer and GLB exporter read the
emitted (Babylon) order.
"""
from __future__ import annotations

import hashlib
import math
from typing import Any

import numpy as np
from scipy.spatial import ConvexHull


def convex(points: list[list[float]] | np.ndarray):
    verts=np.array(points,dtype=float)
    hull=ConvexHull(verts)
    centre=np.mean(verts,axis=0)
    faces=[]
    for indices in hull.simplices:
        a,b,c=map(int,indices)
        normal=np.cross(verts[b]-verts[a],verts[c]-verts[a])
        if np.dot(normal,(verts[[a,b,c]].mean(axis=0)-centre))<0:b,c=c,b
        faces.append([a,b,c])
    return verts,faces


def chamfer_box(w,h,d,bevel=.14):
    b=min(w,h,d)*bevel
    verts=[]
    for sx in [-1,1]:
        for sy in [-1,1]:
            for sz in [-1,1]:
                verts.extend([
                    [sx*(w/2-b),sy*h/2,sz*d/2],
                    [sx*w/2,sy*(h/2-b),sz*d/2],
                    [sx*w/2,sy*h/2,sz*(d/2-b)],
                ])
    return convex(verts)


def armor_panel(w,h,d,outline):
    pts=np.array([[x*w,y*h] for x,y in outline],dtype=float)
    centre=pts.mean(axis=0)
    bevel=min(w,h,d)*.16
    verts=[]
    for depth,scale in [(d/2,1-.075), (d/2-bevel,1),
                        (-d/2+bevel,1),(-d/2,1-.075)]:
        for point in pts:
            xy=centre+(point-centre)*scale
            verts.append([xy[0],xy[1],depth])
    return convex(verts)


def rounded_capsule(w,h,d,segments=12):
    radius=min(w,d)/2
    straight=max(0,h-2*radius)
    rings=[]
    for i in range(5):
        angle=-math.pi/2+i*(math.pi/2)/4
        rings.append((-straight/2+radius*math.sin(angle),math.cos(angle)))
    rings.append((straight/2,1))
    for i in range(1,5):
        angle=i*(math.pi/2)/4
        rings.append((straight/2+radius*math.sin(angle),math.cos(angle)))
    verts=[]
    for y,scale in rings:
        for j in range(segments):
            angle=j*math.tau/segments
            verts.append([w/2*scale*math.cos(angle),y,d/2*scale*math.sin(angle)])
    faces=[]
    for k in range(len(rings)-1):
        for j in range(segments):
            a=k*segments+j;b=k*segments+(j+1)%segments
            c=(k+1)*segments+j;e=(k+1)*segments+(j+1)%segments
            faces.extend([[a,b,e],[a,e,c]])
    return np.array(verts),faces


def ellipsoid(w,h,d,rows=9,segments=16):
    verts=[]
    for k in range(rows+1):
        a=k*math.pi/rows
        for j in range(segments):
            t=j*math.tau/segments
            verts.append([w/2*math.sin(a)*math.cos(t),h/2*math.cos(a),d/2*math.sin(a)*math.sin(t)])
    faces=[]
    for k in range(rows):
        for j in range(segments):
            a=k*segments+j;b=k*segments+(j+1)%segments
            c=(k+1)*segments+j;e=(k+1)*segments+(j+1)%segments
            faces.extend([[a,b,e],[a,e,c]])
    return np.array(verts),faces


def ring_torus(w,h,thickness,major=30,minor=8):
    verts=[]
    radius=(w-thickness)/2
    for i in range(major):
        a=i*math.tau/major
        for j in range(minor):
            b=j*math.tau/minor
            r=radius+thickness/2*math.cos(b)
            verts.append([r*math.cos(a),thickness/2*math.sin(b),r*(h/w)*math.sin(a)])
    faces=[]
    for i in range(major):
        for j in range(minor):
            a=i*minor+j;b=((i+1)%major)*minor+j
            c=i*minor+(j+1)%minor;e=((i+1)%major)*minor+(j+1)%minor
            faces.extend([[a,b,e],[a,e,c]])
    return np.array(verts),faces


def cylinder(w,h,d,segments=12):
    """Cylinder along +Y: height h, elliptical diameters w (X) and d (Z), bevelled rims."""
    b=min(w,d,h)*.12
    verts=[]
    for y,r in [(-h/2,.86),(-h/2+b,1),(h/2-b,1),(h/2,.86)]:
        for j in range(segments):
            a=j*math.tau/segments
            verts.append([w/2*r*math.cos(a),y,d/2*r*math.sin(a)])
    return convex(verts)


def blade(w,h,d):
    # Four sided diamond cross sections taper to a needle point.
    verts=[]
    profile=[(-.50,.52),(-.43,.88),(-.29,1),(.30,.83),(.42,.58),(.50,.006)]
    for z,scale in profile:
        verts.extend([[0,h/2*scale,z*d],[w/2*scale,0,z*d],
                      [0,-h/2*scale,z*d],[-w/2*scale,0,z*d]])
    return convex(verts)


def octahedron(w,h,d):
    return convex([[w/2,0,0],[-w/2,0,0],[0,h/2,0],[0,-h/2,0],[0,0,d/2],[0,0,-d/2]])


def _orient(verts,faces,outward_fn):
    out=[]
    for a,b,c in faces:
        n=np.cross(verts[b]-verts[a],verts[c]-verts[a])
        mid=(verts[a]+verts[b]+verts[c])/3
        out.append([a,c,b] if np.dot(n,outward_fn(mid,(a,b,c)))<0 else [a,b,c])
    return out


def _ring(w,d,off,n,t):
    c,s=math.cos(t),math.sin(t)
    e=2/max(n,.1)
    return (w/2*math.copysign(abs(c)**e,c), off+d/2*math.copysign(abs(s)**e,s))


def _axis_point(axis,along,a,b):
    # Rings are authored as (along, width, depth, offset, exponent). For a
    # vertical loft "a" is X and "b" is Z; for a forward loft "a" is X and
    # "b" is Y, so feet and blades can be lofted along +Z.
    return [a,along,b] if axis=='y' else [a,b,along]


def loft(profile,segments=24,axis='y',caps=True):
    """Smooth closed body form through superellipse cross sections."""
    verts=[]
    for along,w,d,off,n in profile:
        for j in range(segments):
            t=j*math.tau/segments
            a,b=_ring(w,d,off,n,t)
            verts.append(_axis_point(axis,along,a,b))
    faces=[]
    rings=len(profile)
    for k in range(rings-1):
        for j in range(segments):
            a=k*segments+j;b=k*segments+(j+1)%segments
            c=(k+1)*segments+j;e=(k+1)*segments+(j+1)%segments
            faces.extend([[a,e,b],[a,c,e]])
    if caps:
        for k,flip in [(0,True),(rings-1,False)]:
            along,w,d,off,n=profile[k]
            centre=len(verts);verts.append(_axis_point(axis,along,0,off))
            for j in range(segments):
                a=k*segments+j;b=k*segments+(j+1)%segments
                faces.append([centre,a,b] if flip else [centre,b,a])
    verts=np.array(verts,dtype=float)
    side=rings*segments
    centres=[np.array(_axis_point(axis,p[0],0,p[3]),float) for p in profile]
    axis_vec=np.array([0,1,0] if axis=='y' else [0,0,1],float)
    def outward(mid,tri):
        if tri[0]>=side:  # cap fan: centre vertex comes first
            k=0 if tri[0]==side else rings-1
            return -axis_vec if k==0 else axis_vec
        k=tri[0]//segments
        return mid-centres[k]-axis_vec*np.dot(mid-centres[k],axis_vec)
    return verts,_orient(verts,faces,outward)


def shell(profile,arc,thickness,segments=18,axis='y'):
    """Conformal armour plate: a partial loft with real thickness.

    Outer, inner and edge surfaces keep separate vertices so the crisp plate
    edges do not smear the smooth outer shading.
    """
    a0,a1=arc
    rings=len(profile)
    def surface(inset):
        pts=[]
        for along,w,d,off,n in profile:
            for j in range(segments+1):
                t=a0+(a1-a0)*j/segments
                a,b=_ring(max(.002,w-2*inset),max(.002,d-2*inset),off,n,t)
                pts.append(_axis_point(axis,along,a,b))
        return pts
    outer=surface(0);inner=surface(thickness)
    verts=list(outer)+list(inner)
    cols=segments+1;base_in=len(outer)
    faces=[]
    for k in range(rings-1):
        for j in range(segments):
            a=k*cols+j;b=a+1;c=a+cols;e=c+1
            faces.extend([[a,e,b],[a,c,e]])
            faces.extend([[base_in+a,base_in+b,base_in+e],[base_in+a,base_in+e,base_in+c]])
    # Edge walls with their own vertices.
    def wall(ids_outer,ids_inner):
        start=len(verts)
        for i in ids_outer:verts.append(outer[i])
        for i in ids_inner:verts.append(inner[i])
        m=len(ids_outer)
        for i in range(m-1):
            a=start+i;b=start+i+1;c=start+m+i;e=start+m+i+1
            faces.extend([[a,b,e],[a,e,c]])
    wall([k*cols for k in range(rings)],[k*cols for k in range(rings)])
    wall([k*cols+segments for k in range(rings)][::-1],[k*cols+segments for k in range(rings)][::-1])
    wall(list(range(cols))[::-1],list(range(cols))[::-1])
    last=(rings-1)*cols
    wall(list(range(last,last+cols)),list(range(last,last+cols)))
    verts=np.array(verts,dtype=float)
    centres=[np.array(_axis_point(axis,p[0],0,p[3]),float) for p in profile]
    axis_vec=np.array([0,1,0] if axis=='y' else [0,0,1],float)
    plate_centre=np.array(outer).mean(axis=0)
    n_surface=len(outer)
    def outward(mid,tri):
        i=tri[0]
        if i<2*n_surface:
            k=(i%n_surface)//cols
            radial=mid-centres[k]-axis_vec*np.dot(mid-centres[k],axis_vec)
            return radial if i<n_surface else -radial
        return mid-plate_centre
    return verts,_orient(verts,faces,outward)


def orient_outwards(verts,faces,shape):
    fixed=[]
    for a,b,c in faces:
        n=np.cross(verts[b]-verts[a],verts[c]-verts[a])
        centre=(verts[a]+verts[b]+verts[c])/3
        if shape=='torus':
            x,y,z=centre
            angle=math.atan2(z,x)
            radius=(max(abs(verts[:,0]))-min(np.linalg.norm(verts[:,:2],axis=1)))/2
            outward=np.array([x-radius*math.cos(angle),y,z-radius*math.sin(angle)])
        else:outward=centre
        if np.dot(n,outward)<0:fixed.append([a,c,b])
        else:fixed.append([a,b,c])
    return fixed


def normals(verts,faces):
    result=np.zeros_like(verts)
    for a,b,c in faces:
        normal=np.cross(verts[b]-verts[a],verts[c]-verts[a])
        result[a]+=normal;result[b]+=normal;result[c]+=normal
    lengths=np.linalg.norm(result,axis=1)
    result/=np.maximum(lengths[:,None],1e-8)
    return result




def arc_torus(diameter,thickness,a0=0.0,a1=math.tau,major=48,minor=10,ratio=1.0):
    """Torus in the XZ plane (axis +Y). A partial arc gets rounded end caps."""
    full=abs((a1-a0)-math.tau)<1e-6
    radius=(diameter-thickness)/2
    count=major if full else major+1
    verts=[];faces=[]
    for i in range(count):
        a=a0+(a1-a0)*i/major
        for j in range(minor):
            b=j*math.tau/minor
            r=radius+thickness/2*math.cos(b)
            verts.append([r*math.cos(a),thickness/2*math.sin(b),r*ratio*math.sin(a)])
    span=major if full else major
    for i in range(span):
        for j in range(minor):
            n=(i+1)%count
            a=i*minor+j;b=n*minor+j
            c=i*minor+(j+1)%minor;e=n*minor+(j+1)%minor
            faces.extend([[a,b,e],[a,e,c]])
    centres=[]
    for i in range(count):
        a=a0+(a1-a0)*i/major
        centres.append(np.array([radius*math.cos(a),0,radius*ratio*math.sin(a)]))
    if not full:
        for k in (0,count-1):
            centre=len(verts);verts.append(list(centres[k]))
            for j in range(minor):
                faces.append([centre,k*minor+j,k*minor+(j+1)%minor])
    verts=np.array(verts,dtype=float)
    ring_vertices=count*minor
    tangent0=np.array([-math.sin(a0),0,math.cos(a0)*ratio]);tangent1=np.array([-math.sin(a1),0,math.cos(a1)*ratio])
    def outward(mid,tri):
        if tri[0]>=ring_vertices:
            return -tangent0 if tri[0]==ring_vertices else tangent1
        i=tri[0]//minor
        return mid-centres[i]
    return verts,_orient(verts,faces,outward)


def icosphere(w,h,d,subdivisions=2):
    t=(1+5**.5)/2
    verts=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],
           [t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]]
    verts=[list(np.array(v)/np.linalg.norm(v)) for v in verts]
    faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
           [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]]
    for _ in range(subdivisions):
        cache={};new=[]
        def mid(a,b):
            key=(min(a,b),max(a,b))
            if key not in cache:
                m=np.array(verts[a])+np.array(verts[b]);m/=np.linalg.norm(m)
                cache[key]=len(verts);verts.append(list(m))
            return cache[key]
        for a,b,c in faces:
            ab,bc,ca=mid(a,b),mid(b,c),mid(c,a)
            new.extend([[a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]])
        faces=new
    verts=np.array(verts,dtype=float)*np.array([w/2,h/2,d/2])
    return verts,_orient(verts,faces,lambda mid,tri:mid)


def _frames(path,closed):
    pts=np.array(path,dtype=float);n=len(pts)
    tangents=[]
    for i in range(n):
        if closed:t=pts[(i+1)%n]-pts[(i-1)%n]
        elif i==0:t=pts[1]-pts[0]
        elif i==n-1:t=pts[-1]-pts[-2]
        else:t=pts[i+1]-pts[i-1]
        tangents.append(t/np.linalg.norm(t))
    ref=np.array([0,1,0]) if abs(tangents[0][1])<.9 else np.array([1,0,0])
    normal=np.cross(tangents[0],ref);normal/=np.linalg.norm(normal)
    frames=[]
    for i,t in enumerate(tangents):
        if i>0:
            normal=normal-t*np.dot(normal,t)
            if np.linalg.norm(normal)<1e-6:normal=np.cross(t,ref)
            normal/=np.linalg.norm(normal)
        frames.append((t,normal,np.cross(t,normal)))
    return pts,frames


def tube(path,radius,segments=10,closed=False):
    """Circular tube swept along a polyline (parallel-transport frames)."""
    pts,frames=_frames(path,closed)
    radii=radius if isinstance(radius,(list,tuple)) else [radius]*len(pts)
    verts=[]
    for p,(t,nv,bv),r in zip(pts,frames,radii):
        for j in range(segments):
            a=j*math.tau/segments
            verts.append(list(p+r*(math.cos(a)*nv+math.sin(a)*bv)))
    faces=[];rings=len(pts)
    for k in range(rings if closed else rings-1):
        k2=(k+1)%rings
        for j in range(segments):
            a=k*segments+j;b=k*segments+(j+1)%segments
            c=k2*segments+j;e=k2*segments+(j+1)%segments
            faces.extend([[a,b,e],[a,e,c]])
    if not closed:
        for k in (0,rings-1):
            centre=len(verts);verts.append(list(pts[k]))
            for j in range(segments):faces.append([centre,k*segments+j,k*segments+(j+1)%segments])
    verts=np.array(verts,dtype=float)
    side=rings*segments
    def outward(mid,tri):
        if tri[0]>=side:
            return -frames[0][0] if tri[0]==side else frames[-1][0]
        k=tri[0]//segments
        return mid-pts[k]
    return verts,_orient(verts,faces,outward)


def _ear_clip(poly):
    pts=[np.array(p,dtype=float) for p in poly]
    area=sum(pts[i][0]*pts[(i+1)%len(pts)][1]-pts[(i+1)%len(pts)][0]*pts[i][1] for i in range(len(pts)))
    order=list(range(len(pts))) if area>0 else list(range(len(pts)))[::-1]
    tris=[]
    def inside(p,a,b,c):
        def s(p1,p2,p3):return (p1[0]-p3[0])*(p2[1]-p3[1])-(p2[0]-p3[0])*(p1[1]-p3[1])
        d1,d2,d3=s(p,a,b),s(p,b,c),s(p,c,a)
        return not ((d1<0 or d2<0 or d3<0) and (d1>0 or d2>0 or d3>0))
    guard=0
    while len(order)>3 and guard<10000:
        guard+=1
        for k in range(len(order)):
            i0,i1,i2=order[k-1],order[k],order[(k+1)%len(order)]
            a,b,c=pts[i0],pts[i1],pts[i2]
            cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
            if cross<=1e-12:continue
            if any(inside(pts[j],a,b,c) for j in order if j not in (i0,i1,i2)):continue
            tris.append([i0,i1,i2]);order.pop(k);break
        else:break
    if len(order)==3:tris.append(order)
    return tris


def prism(polygon,depth,axis='x'):
    """Extrude a 2D polygon (may be concave) symmetrically along an axis.

    For axis 'x' the polygon is authored in (z, y); for 'z' in (x, y); for 'y'
    in (x, z). Side walls keep their own vertices so edges stay crisp.
    """
    def lift(u,v,s):
        if axis=='x':return [s,v,u]
        if axis=='z':return [u,v,s]
        return [u,s,v]
    n=len(polygon);tris=_ear_clip(polygon)
    verts=[];faces=[]
    for s in (-depth/2,depth/2):
        for u,v in polygon:verts.append(lift(u,v,s))
    for a,b,c in tris:
        faces.append([a,b,c]);faces.append([n+a,n+b,n+c])
    cap_count=len(faces)
    for i in range(n):
        j=(i+1)%n
        start=len(verts)
        for s in (-depth/2,depth/2):
            verts.append(lift(*polygon[i],s));verts.append(lift(*polygon[j],s))
        faces.extend([[start,start+1,start+3],[start,start+3,start+2]])
    verts=np.array(verts,dtype=float)
    axis_vec=np.array({'x':[1,0,0],'z':[0,0,1],'y':[0,1,0]}[axis],float)
    poly=np.array(polygon,float);area=0.5*sum(poly[i][0]*poly[(i+1)%n][1]-poly[(i+1)%n][0]*poly[i][1] for i in range(n))
    ccw=area>0
    out=[]
    for f,(a,b,c) in enumerate(faces):
        if f<cap_count:
            want=axis_vec*(1 if verts[a]@axis_vec>0 else -1)
        else:
            # Side wall: outward is the 2D edge normal.
            e=(f-cap_count)//2;i=e;j=(e+1)%n
            du,dv=poly[j]-poly[i]
            edge=np.array([dv,-du]) if ccw else np.array([-dv,du])
            want=np.array(lift(edge[0],edge[1],0.0))
        nrm=np.cross(verts[b]-verts[a],verts[c]-verts[a])
        out.append([a,c,b] if np.dot(nrm,want)<0 else [a,b,c])
    return verts,out


def cuboid(w,h,d,taper=1.0):
    """Flat-shaded box (24 vertices, 12 triangles); taper scales the top face."""
    x0,x1,y0,y1,z0,z1=-w/2,w/2,-h/2,h/2,-d/2,d/2
    def p(x,y,z):
        s=taper if y>0 else 1.0
        return [x*s,y,z*s]
    quads=[[(x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1)],[(x0,y0,z1),(x0,y1,z1),(x0,y1,z0),(x0,y0,z0)],
           [(x0,y1,z0),(x0,y1,z1),(x1,y1,z1),(x1,y1,z0)],[(x0,y0,z1),(x0,y0,z0),(x1,y0,z0),(x1,y0,z1)],
           [(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)],[(x1,y0,z0),(x0,y0,z0),(x0,y1,z0),(x1,y1,z0)]]
    verts=[];faces=[]
    for q in quads:
        s=len(verts);verts.extend(p(*v) for v in q)
        faces.extend([[s,s+1,s+2],[s,s+2,s+3]])
    verts=np.array(verts,dtype=float)
    return verts,_orient(verts,faces,lambda mid,tri:mid)


def _shape(part):
    w,h,d=part['size'];shape=part['shape']
    if shape=='box':verts,faces=chamfer_box(w,h,d,part.get('bevel',.14))
    elif shape=='cuboid':verts,faces=cuboid(w,h,d,part.get('taper',1.0))
    elif shape=='panel':verts,faces=armor_panel(w,h,d,part['outline'])
    elif shape=='blade':verts,faces=blade(w,h,d)
    elif shape=='capsule':
        verts,faces=rounded_capsule(w,h,d,part.get('segments',12));faces=orient_outwards(verts,faces,'capsule')
    elif shape=='cylinder':verts,faces=cylinder(w,h,d,part.get('segments',12))
    elif shape=='sphere':
        verts,faces=ellipsoid(w,h,d,part.get('rows',9),part.get('segments',16));faces=orient_outwards(verts,faces,'sphere')
    elif shape=='ico':verts,faces=icosphere(w,h,d,part.get('subdivisions',2))
    elif shape=='octa':verts,faces=octahedron(w,h,d)
    elif shape=='torus':
        verts,faces=arc_torus(part.get('diameter',w),part.get('thickness',h),part.get('a0',0.0),part.get('a1',math.tau),
                              part.get('major',36),part.get('minor',8),part.get('ratio',1.0))
    elif shape=='tube':verts,faces=tube(part['path'],part['radius'],part.get('segments',10),part.get('closed',False))
    elif shape=='prism':verts,faces=prism(part['polygon'],part['depth'],part.get('axis','x'))
    elif shape=='loft':
        verts,faces=loft(part['profile'],part.get('segments',24),part.get('axis','y'))
    elif shape=='shell':
        verts,faces=shell(part['profile'],part['arc'],part['thickness'],part.get('segments',18),part.get('axis','y'))
    else:raise ValueError(f'{part["name"]}: unknown shape {shape}')
    return np.asarray(verts,dtype=float),faces


def build(part:dict[str,Any],palette:dict):
    verts,faces=_shape(part)
    w,h,d=part['size']
    ns=normals(verts,faces)
    swatch=palette[part['material']]
    # Tinted materials (team kit, arena accent) carry neutral vertex shading;
    # the game and the renderer multiply in the kit colour.
    base=bytes.fromhex(('#f2f2f2' if swatch.get('tint') else swatch['color'])[1:])
    colors=[];uvs=[]
    uv_scale=part.get('uvScale',1.0)
    for i,(v,n) in enumerate(zip(verts,ns)):
        seed=hashlib.blake2b(f'{part["name"]}:{i}'.encode(),digest_size=2).digest()
        variation=(int.from_bytes(seed,'big')/65535-.5)*.04
        shade=.90+.07*max(0,n[1])+.035*max(0,n[2])+variation
        colors.extend([round(min(1,channel/255*shade),4) for channel in base]+[1])
        if part.get('uvMode')=='world':u,vcoord=v[0]/uv_scale,v[2]/uv_scale
        elif abs(n[1])>=max(abs(n[0]),abs(n[2])):u,vcoord=v[0]/max(w,.1)*2*uv_scale,v[2]/max(d,.1)*2*uv_scale
        elif abs(n[2])>=abs(n[0]):u,vcoord=v[0]/max(w,.1)*2*uv_scale,v[1]/max(h,.1)*2*uv_scale
        else:u,vcoord=v[2]/max(d,.1)*2*uv_scale,v[1]/max(h,.1)*2*uv_scale
        uvs.extend([round(float(u),4),round(float(vcoord),4)])
    return {'positions':[round(float(x),4) for x in verts.flat],
            # Babylon (left-handed) front-face order: swap b and c.
            'indices':[int(x) for a,b,c in faces for x in (a,c,b)],
            'normals':[round(float(x),4) for x in ns.flat],
            'colors':colors,'uvs':uvs}
