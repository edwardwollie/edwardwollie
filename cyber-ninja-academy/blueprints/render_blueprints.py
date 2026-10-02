"""Render orthographic and isometric blueprint plates from app/blueprint-spec.json."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "app/blueprint-spec.json").read_text())
EXTRACTED = json.loads((ROOT / "blueprints/runtime-extracted.json").read_text())
POSES = json.loads((ROOT / "blueprints/runtime-poses.json").read_text())
assert EXTRACTED["version"] == SPEC["version"] == POSES["version"]
SS = 2  # supersampling factor for anti-aliased plates
PLATES = 7
TEXTURES={key:np.array(Image.open(ROOT/"public"/value["texture"].lstrip("/")).convert("RGB"),dtype=np.float32)/255
          for key,value in SPEC["palette"].items() if value.get("texture")}
OUT = ROOT / "blueprints" / "renders"
OUT.mkdir(exist_ok=True)
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BG = (4, 12, 25)
CYAN = (61, 239, 243)
MUTED = (104, 155, 177)


def font(size, bold=False, mono=False):
    return ImageFont.truetype(MONO_PATH if mono else BOLD_PATH if bold else FONT_PATH, size)


def asset_faces(asset, displacement=(0,0,0), selected=None, pose=None):
    # These are the transformed vertices read back from the actual Babylon
    # meshes. The renderer never approximates Babylon's Euler order or shape.
    # A pose swaps in the world positions read back after the game's own pose
    # function was applied to the rig.
    faces=[]
    posed={p["name"]:p for p in POSES["poses"][pose]} if pose else {}
    for part in EXTRACTED["assets"][asset]:
        if selected is not None and part["name"] not in selected:continue
        source=posed.get(part["name"],part)
        vertices=np.array(source["positions"],float).reshape(-1,3)+np.array(displacement)
        world_normals=np.array(source["normals"],float).reshape(-1,3)
        vertex_colors=np.array(part["colors"],float).reshape(-1,4)[:,:3]
        uvs=np.array(part["uvs"],float).reshape(-1,2)
        indices=np.array(part["indices"],int).reshape(-1,3)
        swatch=SPEC["palette"][part["material"]]
        for triangle in indices:
            faces.append((vertices[triangle],world_normals[triangle],
                          vertex_colors[triangle],uvs[triangle],part["material"],swatch["emissive"]))
    return faces


def basis(view):
    vectors={
        "FRONT":([0,0,1],[0,1,0]),"REAR":([0,0,-1],[0,1,0]),
        "LEFT":([-1,0,0],[0,1,0]),"RIGHT":([1,0,0],[0,1,0]),
        "TOP":([0,1,0],[0,0,-1]),"UNDERSIDE":([0,-1,0],[0,0,1]),
        "ISO":([3,2.5,4],[0,1,0]),"ISO REAR":([-3,2.2,-4],[0,1,0]),
        "TOP ISO":([2,5,3],[0,1,0]),
        "FRONT LEFT":([-1,.35,1],[0,1,0]),"FRONT RIGHT":([1,.35,1],[0,1,0]),
        "REAR LEFT":([-1,.35,-1],[0,1,0]),"REAR RIGHT":([1,.35,-1],[0,1,0]),
        "HERO":([1.4,.55,2.1],[0,1,0]),
    }
    camera=np.array(vectors[view][0],float);camera/=np.linalg.norm(camera)
    up=np.array(vectors[view][1],float);right=np.cross(up,camera);right/=np.linalg.norm(right)
    up=np.cross(camera,right);return right,up,camera


def panel(draw,box,title,subtitle,index):
    x0,y0,x1,y1=box
    draw.rounded_rectangle(box,radius=12,fill=(7,22,40),outline=(36,91,116),width=2)
    for x in range(x0+30,x1-15,32):draw.line((x,y0+77,x,y1-23),fill=(15,42,62),width=1)
    for y in range(y0+90,y1-16,32):draw.line((x0+16,y,x1-16,y),fill=(15,42,62),width=1)
    draw.text((x0+24,y0+19),f"{index:02}  {title}",font=font(22,True),fill=(230,248,253))
    draw.text((x0+24,y0+48),subtitle,font=font(12,mono=True),fill=MUTED)
    draw.line((x0+19,y0+76,x1-19,y0+76),fill=(45,116,142),width=1)
    draw.text((x1-76,y1-35),"FZ / 04",font=font(11,mono=True),fill=MUTED)


def render_asset(draw,asset,view,box,fit=.77,shift=(0,0),with_floor=False,selected=None,focus=None,span=None,pose=None,ret=False,lines=True):
    # Every projected triangle here is read from the exact JSON that Babylon
    # supplies to VertexData; no offline substitute primitives are generated.
    faces=asset_faces(asset,selected=selected,pose=pose)
    right,up,camera=basis(view)
    points=np.concatenate([f[0] for f in faces]);px=points @ right;py=points @ up
    cx=(px.min()+px.max())/2;cy=(py.min()+py.max())/2
    x0,y0,x1,y1=box;avail_w=x1-x0-46;avail_h=y1-y0-117
    if focus is not None:
        cx=np.array(focus) @ right;cy=np.array(focus) @ up
        scale=min(avail_w/span[0],avail_h/span[1])*fit
    else:
        scale=min(avail_w/max(.1,px.max()-px.min()),avail_h/max(.1,py.max()-py.min()))*fit
    ox=((x1-x0)/2+shift[0])*SS;oy=((y1-y0+76)/2+shift[1])*SS
    scale*=SS
    width,height=(x1-x0)*SS,(y1-y0)*SS
    zbuffer=np.full((height,width),-np.inf,dtype=np.float32)
    frame=np.zeros((height,width,3),dtype=np.uint8)
    # Camera-relative studio rig: key from upper left of the viewer, cool fill
    # from the right and a magenta rim from behind, so every side reads.
    key=camera*.75+up*.8-right*.55;key/=np.linalg.norm(key)
    fill_light=-camera*.9+up*.25+right*.6;fill_light/=np.linalg.norm(fill_light)
    side_fill=camera*.5+right*.8;side_fill/=np.linalg.norm(side_fill)
    half=(key+camera);half/=np.linalg.norm(half)
    for poly,normals,colors,uvs,material,emission in faces:
        face_normal=np.cross(poly[1]-poly[0],poly[2]-poly[0])
        if np.dot(face_normal,camera)<0:continue
        sx=(poly @ right-cx)*scale+ox
        sy=-(poly @ up-cy)*scale+oy
        depth=poly @ camera
        minx=max(18*SS,int(np.floor(sx.min())));maxx=min(width-18*SS,int(np.ceil(sx.max())))
        miny=max(82*SS,int(np.floor(sy.min())));maxy=min(height-25*SS,int(np.ceil(sy.max())))
        if maxx<minx or maxy<miny:continue
        denominator=(sy[1]-sy[2])*(sx[0]-sx[2])+(sx[2]-sx[1])*(sy[0]-sy[2])
        if abs(denominator)<1e-8:continue
        yy,xx=np.mgrid[miny:maxy+1,minx:maxx+1]
        xx=xx.astype(np.float32)+.5;yy=yy.astype(np.float32)+.5
        a=((sy[1]-sy[2])*(xx-sx[2])+(sx[2]-sx[1])*(yy-sy[2]))/denominator
        b=((sy[2]-sy[0])*(xx-sx[2])+(sx[0]-sx[2])*(yy-sy[2]))/denominator
        c=1-a-b
        inside=(a>=-.001)&(b>=-.001)&(c>=-.001)
        if not inside.any():continue
        z=a*depth[0]+b*depth[1]+c*depth[2]
        local_depth=zbuffer[miny:maxy+1,minx:maxx+1]
        visible=inside&(z>local_depth+1e-5)
        if not visible.any():continue
        normal=a[...,None]*normals[0]+b[...,None]*normals[1]+c[...,None]*normals[2]
        normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
        color=a[...,None]*colors[0]+b[...,None]*colors[1]+c[...,None]*colors[2]
        if material in TEXTURES:
            tex=TEXTURES[material];th,tw=tex.shape[:2]
            uv=a[...,None]*uvs[0]+b[...,None]*uvs[1]+c[...,None]*uvs[2]
            tx=(np.mod(uv[...,0],1)*tw).astype(int)%tw
            ty=(np.mod(1-uv[...,1],1)*th).astype(int)%th
            color*=tex[ty,tx]
        lambert=np.maximum(0,normal @ key)
        rear=np.maximum(0,normal @ fill_light)
        fresnel=np.power(1-np.maximum(0,normal @ camera),2.3)
        spec=np.power(np.maximum(0,normal @ half),52 if material in ("ceramic","armor","steel") else 22)
        lighting=.2+.78*lambert+.13*rear+.16*np.maximum(0,normal @ side_fill)+.08*np.maximum(0,normal[...,1])
        rgb=color*lighting[...,None]
        rgb+=spec[...,None]*(.43 if material in ("ceramic","armor","steel") else .20)
        rgb+=fresnel[...,None]*rear[...,None]*np.array([.12,.035,.17])
        rgb+=color*(.26*min(1.3,emission))
        if material=="suit":rgb*=.82
        rgb=np.clip(rgb,0,1)
        pixels=(rgb*255).astype(np.uint8)
        target=frame[miny:maxy+1,minx:maxx+1]
        target[visible]=pixels[visible]
        local_depth[visible]=z[visible]
    covered=zbuffer>-np.inf
    if lines:
        # Blueprint contour pass: depth discontinuities and the silhouette get
        # a thin cyan technical line, like an engineering drawing overlay.
        z=np.where(covered,zbuffer,np.nan)
        edge=np.zeros_like(covered)
        for dy,dx in ((0,1),(1,0)):
            a=z[:z.shape[0]-dy,:z.shape[1]-dx];b=z[dy:,dx:]
            jump=(np.isnan(a)!=np.isnan(b))|(np.abs(np.nan_to_num(a)-np.nan_to_num(b))>.035)
            edge[:edge.shape[0]-dy,:edge.shape[1]-dx]|=jump
        edge&=covered|np.roll(covered,1,0)|np.roll(covered,1,1)
        line=np.array([120,236,255],np.float32)
        f=frame.astype(np.float32);f[edge]=f[edge]*.35+line*.65;frame=f.astype(np.uint8)
        covered=covered|edge
    mask=covered.astype(np.uint8)*255
    size=(x1-x0,y1-y0)
    cutout=Image.fromarray(frame,"RGB").convert("RGBA")
    cutout.putalpha(Image.fromarray(mask,"L"))
    cutout=cutout.resize(size,Image.LANCZOS)
    mask=np.array(cutout.getchannel("A"))
    # The halo uses the same silhouette; it changes the presentation only.
    backdrop=Image.new("RGBA",cutout.size,(42,203,230,0))
    halo=Image.fromarray(mask,"L").filter(ImageFilter.GaussianBlur(17))
    halo=halo.point(lambda p:int(p*.18));backdrop.putalpha(halo)
    draw._image.paste(backdrop.convert("RGB"),(x0,y0),backdrop.getchannel("A"))
    draw._image.paste(cutout.convert("RGB"),(x0,y0),cutout.getchannel("A"))
    if ret:
        return lambda p:(int((np.array(p)@right-cx)*scale/SS+ox/SS+x0),int(-(np.array(p)@up-cy)*scale/SS+oy/SS+y0))


def header(draw,title,kicker,detail,w):
    draw.rectangle((0,0,w,143),fill=(5,17,31))
    draw.rectangle((45,37,53,109),fill=CYAN)
    draw.text((76,30),kicker,font=font(15,mono=True),fill=CYAN)
    draw.text((76,54),title,font=font(39,True),fill=(233,249,253))
    draw.text((w-735,92),detail,font=font(13,mono=True),fill=MUTED)
    draw.line((45,138,w-45,138),fill=(39,118,146),width=2)


def footer(draw,w,h,number):
    draw.line((45,h-60,w-45,h-60),fill=(39,118,146),width=2)
    draw.text((45,h-44),f"CYBER NINJA ACADEMY // SPEC {SPEC['version']} // GAME GEOMETRY = BLUEPRINT GEOMETRY",
              font=font(12,mono=True),fill=MUTED)
    draw.text((w-145,h-44),f"PLATE {number}/{PLATES}",font=font(12,mono=True),fill=CYAN)




def dim_line(d,a,b,label,offset=(0,0),vertical=True):
    """Engineering dimension with end ticks and label."""
    (x0,y0),(x1,y1)=a,b
    x0+=offset[0];x1+=offset[0];y0+=offset[1];y1+=offset[1]
    d.line((x0,y0,x1,y1),fill=CYAN,width=1)
    if vertical:
        for y in (y0,y1):d.line((x0-9,y,x0+9,y),fill=CYAN,width=2)
        d.text((x0+8,(y0+y1)/2-6),label,font=font(11,mono=True),fill=CYAN)
    else:
        for x in (x0,x1):d.line((x,y0-9,x,y0+9),fill=CYAN,width=2)
        d.text(((x0+x1)/2-30,y0+8),label,font=font(11,mono=True),fill=CYAN)


def plate(title,kicker,detail):
    w,h=2100,1560;img=Image.new("RGB",(w,h),BG);d=ImageDraw.Draw(img)
    header(d,title,kicker,detail,w);return img,d,w,h


DIM=SPEC["dimensions"]
H=DIM["ninjaHeight"]
TOTAL_PARTS=sum(len(v) for v in SPEC["assets"].values())
NINJA_TRIS=sum(len(p["mesh"]["indices"])//3 for p in SPEC["assets"]["ninja"])


def make_character_plate():
    img,d,w,h=plate("OPERATIVE / SIX SIDES","ORTHOGRAPHIC CHARACTER ATLAS",
                    f"{H:.2f} m  |  {len(SPEC['assets']['ninja'])} PARTS  |  {NINJA_TRIS:,} TRIANGLES  |  16 JOINTS")
    names=[("FRONT","+Z WRAP VISOR / CHEST PLATE / CORE"),("REAR","-Z REACTOR / SHEATH / SCARF"),
           ("LEFT","-X PROFILE / PAULDRON / KATANA"),("RIGHT","+X PROFILE / SENSOR POD"),
           ("TOP","+Y CREST / SHOULDERS / BLADE"),("UNDERSIDE","-Y SOLES / HEEL JETS")]
    for i,(view,sub) in enumerate(names):
        col,row=i%3,i//3
        box=(45+col*680,172+row*655,705+col*680,807+row*655)
        panel(d,box,view,sub,i+1)
        proj=render_asset(d,"ninja",view,box,fit=.84,ret=True)
        if view in ("FRONT","REAR"):
            top=proj([0,H,0]);bottom=proj([0,0,0])
            dim_line(d,(box[2]-60,top[1]),(box[2]-60,bottom[1]),f"{H:.2f} m")
            l=proj([-DIM["ninjaShoulderWidth"]/2,0,0]);r=proj([DIM["ninjaShoulderWidth"]/2,0,0])
            dim_line(d,(l[0],bottom[1]+22),(r[0],bottom[1]+22),f"{DIM['ninjaShoulderWidth']:.2f} m SHOULDER",vertical=False)
    footer(d,w,h,1)
    img.save(OUT/"01-ninja-six-view-atlas.png",optimize=True)


def make_quarter_plate():
    img,d,w,h=plate("OPERATIVE / QUARTER VIEWS","EVERY ANGLE BETWEEN THE SIDES",
                    "45 DEG AZIMUTH  |  20 DEG ELEVATION  |  EXACT RUNTIME VERTICES")
    names=[("FRONT LEFT","VISOR WRAP / LEFT PAULDRON / BRACER"),("FRONT RIGHT","KATANA HAND / CORE / GREAVES"),
           ("REAR LEFT","SHEATH / BACK PLATE / SCARF TAILS"),("REAR RIGHT","REACTOR RING / THRUSTERS / CALF GUARDS")]
    for i,(view,sub) in enumerate(names):
        box=(45+i*510,172,535+i*510,1450)
        panel(d,box,view,sub,i+1)
        render_asset(d,"ninja",view,box,fit=.92,focus=(0,1.0,.15),span=(2.5,2.25))
    footer(d,w,h,2)
    img.save(OUT/"02-ninja-quarter-views.png",optimize=True)


def make_detail_plate():
    img,d,w,h=plate("OPERATIVE / 3D DETAIL REVIEW","RUNTIME MESH DETAIL",
                    "LOFTED UNDER-SUIT  |  CONFORMAL ARMOUR SHELLS  |  PHOTON KATANA")
    hero=(45,170,1340,1450)
    panel(d,hero,"PLAYABLE OPERATIVE // HERO QUARTER","WRAP VISOR / CERAMIC PLATES / CARBON WEAVE / PHOTON EDGE",1)
    proj=render_asset(d,"ninja","HERO",hero,fit=.9,ret=True)
    names={p["name"] for p in SPEC["assets"]["ninja"]}
    blade_set={p["name"] for p in SPEC["assets"]["ninja"] if p.get("group") in ("bladePivot","rightHand")}
    blade_set|={n for n in names if n.endswith("R") and any(k in n for k in ("foreArm","bracer","wristEmitter"))}
    head_set={p["name"] for p in SPEC["assets"]["ninja"] if p.get("group") in ("head","neck")}
    back_set={p["name"] for p in SPEC["assets"]["ninja"] if p.get("group") in ("chest","spine")}
    details=[
        ((1360,170,2055,556),"HELMET // FRONT QUARTER","WRAP VISOR + SENSOR PODS + FACEPLATE","FRONT RIGHT",head_set,.82),
        ((1360,574,2055,960),"REACTOR // REAR","BACK PLATE + REACTOR RING + SHEATH","REAR",back_set,.86),
        ((1360,978,2055,1450),"PHOTON KATANA // HAND","TSUBA + HILT + BLADE RAILS + GRIP","ISO",blade_set,.86),
    ]
    for i,(box,title,sub,view,sel,fit) in enumerate(details,2):
        panel(d,box,title,sub,i)
        render_asset(d,"ninja",view,box,fit=fit,selected=sel)
    d.line((45,1460,w-45,1460),fill=(40,111,139),width=2)
    swatches=[("CERAMIC PLATE","ceramic"),("ANODISED ARMOUR","armor"),("CARBON SUIT","suit"),
              ("VISOR / PHOTON","visor"),("REACTOR","magenta")]
    for i,(label,key) in enumerate(swatches):
        x=48+i*400;rgb=bytes.fromhex(SPEC["palette"][key]["color"][1:])
        d.rounded_rectangle((x,1468,x+32,1492),radius=5,fill=tuple(rgb))
        d.text((x+43,1473),label,font=font(12,mono=True),fill=(170,206,220))
    footer(d,w,h,3)
    img.save(OUT/"03-ninja-runtime-detail.png",optimize=True)


def make_pose_plate():
    img,d,w,h=plate("OPERATIVE / ARTICULATION + POSES","RIG USED BY BOTH GAME MODES",
                    "16 JOINTS + BLADE + SCARF  |  POSES = app/ninja-rig.ts")
    rig_box=(45,172,600,1450)
    panel(d,rig_box,"JOINT MAP // FRONT","PIVOTS AND PARENT CHAIN",1)
    proj=render_asset(d,"ninja","FRONT",rig_box,fit=.86,ret=True,lines=False)
    # Dim the body so the skeleton reads on top.
    overlay=Image.new("RGBA",(rig_box[2]-rig_box[0],rig_box[3]-rig_box[1]-80),(4,14,28,150))
    img.paste(overlay,(rig_box[0],rig_box[1]+80),overlay)
    joints=POSES["joints"];parents=POSES["parents"]
    for name,parent in parents.items():
        if parent in joints and parent!="root" and name not in ("bladePivot","scarf"):
            d.line((*proj(joints[parent]),*proj(joints[name])),fill=(255,80,170),width=3)
    labels={"head":"HEAD","neck":"NECK","chest":"CHEST","spine":"SPINE","hips":"HIPS","rightUpperArm":"SHOULDER R",
            "rightForeArm":"ELBOW R","rightHand":"WRIST R","leftThigh":"HIP L","leftShin":"KNEE L","leftFoot":"ANKLE L"}
    for name,pos in joints.items():
        if name in ("bladePivot","scarf","root"):continue
        x,y=proj(pos);d.ellipse((x-6,y-6,x+6,y+6),fill=(10,30,45),outline=CYAN,width=2)
        if name in labels:
            tx=x+14 if pos[0]>=0 else x-14-len(labels[name])*7
            d.text((tx,y-7),labels[name],font=font(11,mono=True),fill=(200,240,250))
    poses=[("stance","STANCE","GUARD / KATANA LOW"),("run","SPRINT","STRIDE PHASE 90 DEG"),
           ("jump","AIR STEP","RISING TUCK"),("slide","POWER SLIDE","HIP DROP 0.62 m"),
           ("strike","KATANA CHAIN","RISING DIAGONAL CUT"),("finisher","FINISHER","OVERHEAD STRIKE"),
           ("dash","PHASE DASH","TORPEDO / BLADE SWEPT"),]
    for i,(key,title,sub) in enumerate(poses):
        col,row=i%4,i//4
        if i==7:break
        box=(620+col*360,172+row*640,970+col*360,800+row*640) if i<4 else (620+(col)*360,812,970+col*360,1450)
        panel(d,box,title,sub,i+2)
        render_asset(d,"ninja","FRONT LEFT" if key not in ("slide","dash") else "LEFT",box,fit=.84,pose=key)
    box=(620+3*360,812,970+3*360,1450)
    panel(d,box,"ANIMATION LAYER","HOW THE GAME BLENDS",9)
    notes=["Each frame the game picks a pose:","idle, run, air, slide, dash,","strike chain or hurt.","",
           "Joint rotations ease toward","the target (13-24 per second).","","The double jump adds a full","hip somersault on top.","",
           "Blueprint poses above are read","back from Babylon after the","same pose functions ran."]
    for k,line in enumerate(notes):d.text((box[0]+26,box[1]+105+k*24),line,font=font(13,mono=True),fill=(170,206,220))
    footer(d,w,h,4)
    img.save(OUT/"04-articulation-pose-sheet.png",optimize=True)


def make_city_plate():
    img,d,w,h=plate("CITY OPS / ASSET FAMILY","FREE-ROAM OPEN-CITY MODULES",
                    "ENEMIES  |  TRAVERSAL  |  OBJECTIVES  |  SKYLINE")
    entries=[
        ("AEGIS HUNTER DRONE","ISO","drone","ORBITS / CHARGES / FIRES PLASMA",.8),
        ("HUNTER DRONE // FRONT","FRONT","drone","RED RING = SHOT INCOMING",.8),
        ("UPLINK BEACON","ISO","beacon","EXTRACTION / ACTIVATES ON CLEAR",.86),
        ("LAUNCH PAD","TOP ISO","jump_pad","17.5 m/s VERTICAL LAUNCH",.82),
        ("DATA SHARD","ISO","shard","OBJECTIVE PICKUP",.72),
        ("REPAIR CELL","ISO","repair_cell","+35 INTEGRITY",.7),
        ("SKYLINE TOWER","ISO REAR","sky_tower","25 m / DISTANT RING",.84),
        ("ROOFTOP MODULE","TOP ISO","roof_tile","SURVIVAL LANE DECK",.86),
    ]
    for i,(title,view,asset,sub,fit) in enumerate(entries):
        col,row=i%4,i//4
        box=(45+col*510,172+row*655,535+col*510,807+row*655)
        panel(d,box,title,sub,i+1)
        render_asset(d,asset,view,box,fit=fit)
    footer(d,w,h,5)
    img.save(OUT/"05-city-ops-assets.png",optimize=True)


def make_survival_plate():
    img,d,w,h=plate("SURVIVAL COURSE / HAZARDS","SHARED GAME MESHES",
                    "JUMP RED  |  SLIDE MAGENTA  |  SHIFT ORANGE  |  FINISH ALIVE")
    entries=[
        ("JUMP BARRIER","ISO","barrier","LOW RED BLOCK / JUMP",.84),
        ("FLOOR SPIKES","ISO","spike","RETRACTABLE TEETH / JUMP",.86),
        ("LASER GATE","ISO","beam","OVERHEAD BEAM / SLIDE",.82),
        ("SWEEP BAR","ISO","sweep","LOW ARC / SLIDE",.82),
        ("SHIFT WALL","ISO","wall","TALL GATE / CHANGE LANE",.83),
        ("CRUSHER SHUTTER","ISO","crusher","HEAVY GATE / CHANGE LANE",.83),
        ("OPTIONAL DRONE","FRONT","drone","STRIKE FOR BONUS / SAFE TO PASS",.76),
        ("FINISH GATE","FRONT","finish_gate","SURVIVE WITH INTEGRITY",.88),
    ]
    for i,(title,view,asset,sub,fit) in enumerate(entries):
        col,row=i%4,i//4
        box=(45+col*510,172+row*655,535+col*510,807+row*655)
        panel(d,box,title,sub,i+1)
        render_asset(d,asset,view,box,fit=fit)
    footer(d,w,h,6)
    img.save(OUT/"06-survival-course-hazards.png",optimize=True)


def make_warden_plate():
    pts=np.concatenate([np.array(p["positions"]).reshape(-1,3) for p in EXTRACTED["assets"]["warden"]])
    span=pts[:,0].max()-pts[:,0].min();tall=pts[:,1].max()-pts[:,1].min()
    img,d,w,h=plate("WARDEN / SECTOR BOSS","SIX SIDES + QUARTER VIEWS",
                    f"{span:.1f} m SPAN  |  {tall:.1f} m TALL  |  {len(SPEC['assets']['warden'])} PARTS  |  {sum(len(p['mesh']['indices'])//3 for p in SPEC['assets']['warden']):,} TRIANGLES")
    entries=[("FRONT","FRONT","EYE / BROW / JAW PLATES"),("REAR","REAR","BACK SHELL / CROWN"),("LEFT","LEFT","CANNON PYLONS / RINGS"),
             ("TOP","TOP","CROWN SPIKES / SHIELD FINS"),("UNDERSIDE","UNDERSIDE","THRUSTERS / BELLY LIGHTS"),("RIGHT","RIGHT","PROFILE"),
             ("ISO","FRONT QUARTER","ORBIT RINGS ROTATE IN PLAY"),("ISO REAR","REAR QUARTER","WEAK POINT: THE EYE")]
    for i,(view,title,sub) in enumerate(entries):
        col,row=i%4,i//4
        box=(45+col*510,172+row*655,535+col*510,807+row*655)
        panel(d,box,title,sub,i+1)
        proj=render_asset(d,"warden",view,box,fit=.82,ret=True)
        if view=="FRONT":
            l=proj([pts[:,0].min(),0,0]);r=proj([pts[:,0].max(),0,0])
            dim_line(d,(l[0],box[3]-60),(r[0],box[3]-60),f"{span:.2f} m",vertical=False)
    footer(d,w,h,7)
    img.save(OUT/"07-warden-boss.png",optimize=True)


def make_og_image():
    w,h=1200,630;img=Image.new("RGB",(w,h),(3,9,22));d=ImageDraw.Draw(img)
    for x in range(0,w,38):d.line((x,0,x,h),fill=(12,31,50),width=1)
    for y in range(0,h,38):d.line((0,y,w,y),fill=(12,31,50),width=1)
    for radius in [225,185,146]:
        d.ellipse((790-radius,315-radius,790+radius,315+radius),outline=(31,96,121),width=2)
    render_asset(d,"ninja","FRONT RIGHT",(620,-20,1180,640),fit=.95,pose="strike")
    d.rectangle((44,72,51,196),fill=CYAN)
    d.text((77,78),"FLEXZONIC // SHADOW NETWORK",font=font(17,mono=True),fill=CYAN)
    d.text((77,147),"CYBER",font=font(69,True),fill=(235,250,253))
    d.text((77,216),"NINJA",font=font(69,True),fill=(235,250,253))
    d.text((77,285),"ACADEMY",font=font(51,True),fill=(255,69,162))
    d.line((77,376,526,376),fill=(46,151,177),width=2)
    d.text((77,400),"ROAM. STRIKE. ASCEND.",font=font(24,True),fill=CYAN)
    d.text((77,453),"FULL 3D CITY OPS  /  12 SURVIVAL TRIALS  /  KATANA COMBAT",font=font(14,mono=True),fill=MUTED)
    d.text((77,579),"BLUEPRINT SERIES 04 // LIVE GEOMETRY",font=font(12,mono=True),fill=MUTED)
    img.save(ROOT/"public/og.png",optimize=True)


if __name__=="__main__":
    import sys
    jobs={"1":make_character_plate,"2":make_quarter_plate,"3":make_detail_plate,"4":make_pose_plate,
          "5":make_city_plate,"6":make_survival_plate,"7":make_warden_plate,"og":make_og_image}
    for key in (sys.argv[1:] or list(jobs)):jobs[key]()
    for path in sorted(OUT.glob("*.png")):print(path.name,path.stat().st_size)
