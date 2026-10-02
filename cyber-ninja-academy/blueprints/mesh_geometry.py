"""Deterministic indexed triangle meshes for the game and blueprint renderer.

All vertices, indices, normals and vertex colors written to blueprint-spec.json
are consumed directly by Babylon and by the offline blueprint camera.
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
    length=d if d>h*1.7 else h
    depth=w if d>h*1.7 else d
    b=min(w,depth,length)*.12
    verts=[]
    for y,r in [(-length/2,.82),(-length/2+b,1),
                (length/2-b,1),(length/2,.82)]:
        for j in range(segments):
            a=j*math.tau/segments
            verts.append([w/2*r*math.cos(a),y,depth/2*r*math.sin(a)])
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


def build(part:dict[str,Any],palette:dict):
    w,h,d=part['size'];shape=part['shape']
    if shape=='box':verts,faces=chamfer_box(w,h,d)
    elif shape=='panel':verts,faces=armor_panel(w,h,d,part['outline'])
    elif shape=='blade':verts,faces=blade(w,h,d)
    elif shape=='capsule':verts,faces=rounded_capsule(w,h,d)
    elif shape=='cylinder':verts,faces=cylinder(w,h,d)
    elif shape=='sphere':verts,faces=ellipsoid(w,h,d)
    elif shape=='octa':verts,faces=octahedron(w,h,d)
    elif shape=='torus':verts,faces=ring_torus(w,h,d)
    elif shape=='loft':
        verts,faces=loft(part['profile'],part.get('segments',24),part.get('axis','y'))
    elif shape=='shell':
        verts,faces=shell(part['profile'],part['arc'],part['thickness'],part.get('segments',18),part.get('axis','y'))
    else:raise ValueError(f'{part["name"]}: unknown shape {shape}')
    if shape in ('capsule','sphere','torus'):
        faces=orient_outwards(verts,faces,shape)
    ns=normals(verts,faces)
    base=bytes.fromhex(palette[part['material']]['color'][1:])
    colors=[]
    uvs=[]
    for i,(v,n) in enumerate(zip(verts,ns)):
        seed=hashlib.blake2b(f'{part["name"]}:{i}'.encode(),digest_size=2).digest()
        variation=(int.from_bytes(seed,'big')/65535-.5)*.045
        shade=.90+.07*max(0,n[1])+.035*max(0,n[2])+variation
        colors.extend([round(min(1,channel/255*shade),4) for channel in base]+[1])
        if part['name']=='deckSurface':u,vcoord=v[0]/1.8,v[2]/1.8
        elif abs(n[2])>=abs(n[0]):u,vcoord=v[0]/max(w,.1)*2,v[1]/max(h,.1)*2
        else:u,vcoord=v[2]/max(d,.1)*2,v[1]/max(h,.1)*2
        uvs.extend([round(float(u),4),round(float(vcoord),4)])
    return {'positions':[round(float(x),4) for x in verts.flat],
            'indices':[int(x) for face in faces for x in face],
            'normals':[round(float(x),4) for x in ns.flat],
            'colors':colors,'uvs':uvs}
