"""Authoritative geometric recipe for Cyber Ninja Academy 4.0.

Run this script after changing dimensions or colors. The emitted JSON is loaded
by the game and by the orthographic blueprint renderer.

Version 4 replaces the blocky 2.75 m suit with an anatomically proportioned
1.92 m operative. Every body form is a smooth loft through superellipse cross
sections and every armour plate is a conformal shell offset from that body, so
the plates follow the musculature the way real armour would.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from mesh_geometry import build as build_mesh
from make_textures import make_all as make_textures

ROOT = Path(__file__).resolve().parents[1]
VERSION = "4.1.0"
PI = math.pi

palette = {
    "void": {"color": "#030916", "emissive": 0.02},
    "suit": {"color": "#1f344b", "emissive": 0.05},
    "armor": {"color": "#36587a", "emissive": 0.08},
    "ceramic": {"color": "#c3d5df", "emissive": 0.07},
    "cyan": {"color": "#3af0f5", "emissive": 1.2},
    "cyanGlass": {"color": "#1a9fb8", "emissive": 0.7},
    "visor": {"color": "#23e8ff", "emissive": 1.35},
    "magenta": {"color": "#ff3b9d", "emissive": 1.1},
    "gold": {"color": "#ffbc58", "emissive": 0.85},
    "red": {"color": "#ff405a", "emissive": 1.0},
    "orange": {"color": "#ff8a35", "emissive": 0.95},
    "floor": {"color": "#101d32", "emissive": 0.045},
    "steel": {"color": "#3a5268", "emissive": 0.06},
    "window": {"color": "#2bd1eb", "emissive": 0.8},
}
for texture_name in ('suit','armor','ceramic','steel','floor','void'):
    palette[texture_name]['texture']=f'/blueprint-textures/{texture_name}-finish.png'

assets: dict[str, list[dict]] = {key: [] for key in
    ("ninja", "drone", "barrier", "beam", "wall", "spike", "sweep",
     "crusher", "shard", "finish_gate", "roof_tile", "sky_tower",
     "beacon", "jump_pad", "repair_cell", "warden")}


def part(asset, name, shape, size, at, material, group="root", rotation=None, **extra):
    item = {"name": name, "shape": shape, "size": size, "position": at,
            "material": material}
    if group != "root":
        item["group"] = group
    if rotation:
        item["rotation"] = rotation
    item.update(extra)
    assets[asset].append(item)
    return item


# ---------------------------------------------------------------------------
# Loft helpers
# ---------------------------------------------------------------------------

def bbox(profile, axis="y"):
    along=[p[0] for p in profile]
    w=max(p[1] for p in profile)
    d=max(abs(p[3])+p[2]/2 for p in profile)*2
    return [round(max(w,.01),4), round(max(max(along)-min(along),.01),4) if axis=="y" else round(max(d,.01),4),
            round(max(d,.01),4) if axis=="y" else round(max(max(along)-min(along),.01),4)]


def body(asset, name, profile, material, group, at=(0,0,0), rotation=None, segments=24, axis="y"):
    return part(asset, name, "loft", bbox(profile, axis), list(at), material, group, rotation,
                profile=[[round(v,4) for v in ring] for ring in profile], segments=segments, axis=axis)


def interp(profile, y):
    """Cross section of a body profile at height y (linear between rings)."""
    pts=sorted(profile,key=lambda p:p[0])
    if y<=pts[0][0]:return list(pts[0])
    if y>=pts[-1][0]:return list(pts[-1])
    for a,b in zip(pts,pts[1:]):
        if a[0]<=y<=b[0]:
            t=(y-a[0])/(b[0]-a[0])
            return [y]+[a[i]+(b[i]-a[i])*t for i in range(1,5)]
    raise ValueError(y)


def slice_profile(profile, y0, y1, inflate, rings=5, taper=0.0):
    out=[]
    for i in range(rings):
        y=y0+(y1-y0)*i/(rings-1)
        _,w,d,off,n=interp(profile,y)
        # A slight taper at each plate edge reads as a rolled armour lip.
        edge=1-taper*(abs(i-(rings-1)/2)/((rings-1)/2))**4
        out.append([y,(w+2*inflate)*edge,(d+2*inflate)*edge,off,n])
    return out


def plate(asset, name, profile, y0, y1, inflate, arc, material, group, thickness=.012,
          rings=5, taper=.04, segments=18, at=(0,0,0), rotation=None):
    prof=slice_profile(profile,y0,y1,inflate,rings,taper)
    return part(asset, name, "shell", bbox(prof), list(at), material, group, rotation,
                profile=[[round(v,4) for v in ring] for ring in prof],
                arc=[round(arc[0],4), round(arc[1],4)], thickness=thickness, segments=segments)


def mirror_arc(arc, side):
    """Arcs are authored for the right (+X) side; mirror them for the left."""
    if side>0:return arc
    return (PI-arc[1], PI-arc[0])


FRONT = PI/2
BACK = 3*PI/2


# ---------------------------------------------------------------------------
# Skeleton. Every group is a joint the game animates; positions are relative
# to the parent joint. Feet rest on Y=0, +Z is forward, height is 1.92 m.
# ---------------------------------------------------------------------------
groups = {
    "hips": {"parent": "root", "position": [0, 1.00, 0]},
    "spine": {"parent": "hips", "position": [0, 0.08, 0]},
    "chest": {"parent": "spine", "position": [0, 0.24, 0]},
    "neck": {"parent": "chest", "position": [0, 0.275, -0.01]},
    "head": {"parent": "neck", "position": [0, 0.085, 0.01]},
    "leftUpperArm": {"parent": "chest", "position": [-0.205, 0.205, -0.01], "rotation": [0, 0, -0.11]},
    "leftForeArm": {"parent": "leftUpperArm", "position": [0, -0.29, 0], "rotation": [-0.22, 0, 0]},
    "leftHand": {"parent": "leftForeArm", "position": [0, -0.265, 0]},
    "rightUpperArm": {"parent": "chest", "position": [0.205, 0.205, -0.01], "rotation": [0, 0, 0.11]},
    "rightForeArm": {"parent": "rightUpperArm", "position": [0, -0.29, 0], "rotation": [-0.22, 0, 0]},
    "rightHand": {"parent": "rightForeArm", "position": [0, -0.265, 0]},
    "leftThigh": {"parent": "hips", "position": [-0.105, -0.05, 0]},
    "leftShin": {"parent": "leftThigh", "position": [0, -0.44, 0]},
    "leftFoot": {"parent": "leftShin", "position": [0, -0.43, 0]},
    "rightThigh": {"parent": "hips", "position": [0.105, -0.05, 0]},
    "rightShin": {"parent": "rightThigh", "position": [0, -0.44, 0]},
    "rightFoot": {"parent": "rightShin", "position": [0, -0.43, 0]},
    "bladePivot": {"parent": "rightHand", "position": [0, -0.075, 0.0], "rotation": [0.62, 0, 0]},
    "scarf": {"parent": "neck", "position": [0, 0.02, -0.08]},
}

# Anatomical profiles: (height, width, depth, forward offset, superellipse n)
PELVIS = [[-0.13,0.20,0.15,0.0,2.2],[-0.09,0.31,0.21,0.0,2.4],[-0.02,0.355,0.23,0.0,2.6],
          [0.05,0.345,0.22,0.0,2.6],[0.11,0.31,0.205,0.0,2.4]]
ABDOMEN = [[-0.05,0.30,0.20,0.0,2.4],[0.05,0.28,0.19,0.01,2.4],[0.15,0.295,0.20,0.012,2.4],
           [0.27,0.33,0.215,0.012,2.5]]
CHEST = [[-0.03,0.33,0.215,0.012,2.5],[0.05,0.37,0.24,0.016,2.6],[0.13,0.405,0.252,0.012,2.7],
         [0.19,0.425,0.24,0.0,2.9],[0.24,0.39,0.20,-0.01,3.0],[0.28,0.24,0.15,-0.015,2.4],
         [0.30,0.13,0.12,-0.01,2.0]]
NECK = [[-0.03,0.125,0.125,0.0,2.0],[0.05,0.11,0.115,0.005,2.0],[0.11,0.115,0.12,0.01,2.0]]
SKULL = [[-0.035,0.10,0.11,0.035,2.0],[0.0,0.145,0.17,0.02,2.2],[0.05,0.172,0.205,0.008,2.3],
         [0.11,0.182,0.222,0.0,2.3],[0.17,0.176,0.214,-0.006,2.25],[0.21,0.15,0.18,-0.01,2.1],
         [0.24,0.10,0.12,-0.012,2.0],[0.255,0.04,0.05,-0.012,2.0]]
UPPER_ARM = [[0.055,0.10,0.10,0.0,2.0],[0.0,0.13,0.125,0.0,2.2],[-0.06,0.122,0.118,0.005,2.2],
             [-0.14,0.108,0.104,0.004,2.2],[-0.22,0.094,0.094,0.0,2.2],[-0.295,0.085,0.088,0.0,2.0]]
FOREARM = [[0.025,0.084,0.084,0.0,2.0],[-0.04,0.094,0.09,0.004,2.2],[-0.12,0.084,0.074,0.002,2.3],
           [-0.20,0.068,0.058,0.0,2.3],[-0.255,0.060,0.050,0.0,2.2]]
THIGH = [[0.05,0.15,0.16,0.0,2.2],[-0.03,0.172,0.178,0.008,2.3],[-0.13,0.165,0.17,0.016,2.3],
         [-0.25,0.142,0.147,0.012,2.3],[-0.36,0.12,0.126,0.006,2.2],[-0.445,0.104,0.11,0.0,2.2]]
SHIN = [[0.02,0.104,0.11,0.0,2.2],[-0.06,0.11,0.12,-0.01,2.2],[-0.14,0.114,0.13,-0.02,2.2],
        [-0.24,0.096,0.106,-0.012,2.2],[-0.34,0.076,0.08,0.0,2.2],[-0.40,0.07,0.074,0.0,2.0]]
# The boot is lofted forward along +Z: (z, width, height, vertical offset, n)
BOOT = [[-0.075,0.082,0.10,-0.03,2.4],[-0.04,0.10,0.115,-0.022,3.0],[0.03,0.102,0.10,-0.03,3.2],
        [0.10,0.098,0.074,-0.043,3.2],[0.155,0.084,0.054,-0.053,3.0],[0.185,0.056,0.034,-0.063,2.4]]

N="ninja"

# --- Core body (carbon under-suit) -----------------------------------------
body(N,"pelvis",PELVIS,"suit","hips",segments=28)
body(N,"abdomen",ABDOMEN,"suit","spine",segments=28)
body(N,"ribcage",CHEST,"suit","chest",segments=28)
body(N,"neckSeal",NECK,"suit","neck",segments=20)
body(N,"skull",SKULL,"suit","head",segments=28)

# --- Helmet: smooth shell, wrap visor, faceplate, sensor pods -------------
HELMET=[[y,w+.034,d+.034,off,n] for y,w,d,off,n in SKULL]
body(N,"helmetShell",HELMET[1:],"armor","head",segments=32)
plate(N,"visor",HELMET,.075,.13,.006,(FRONT-1.15,FRONT+1.15),"visor","head",thickness=.01,rings=4,taper=.0,segments=24)
plate(N,"visorBrow",HELMET,.13,.152,.012,(FRONT-1.2,FRONT+1.2),"ceramic","head",thickness=.012,rings=3,taper=.0,segments=24)
plate(N,"faceplate",HELMET,-.03,.073,.010,(FRONT-0.95,FRONT+0.95),"ceramic","head",thickness=.014,rings=5,taper=.12,segments=20)
plate(N,"crownPlate",HELMET,.16,.235,.008,(FRONT-0.75,FRONT+0.75),"ceramic","head",thickness=.012,rings=4,taper=.1)
plate(N,"helmetNape",HELMET,-.02,.17,.007,(BACK-1.0,BACK+1.0),"armor","head",thickness=.012,rings=5,taper=.08)
plate(N,"crestLine",HELMET,.12,.255,.016,(FRONT-0.05,FRONT+0.05),"cyan","head",thickness=.01,rings=6,taper=.0,segments=3)
for i,y in enumerate([.0,.022,.044]):
    part(N,f"respiratorSlit{i}","box",[.05,.007,.012],[0,y,.148],"magenta","head")
for side,lab in [(-1,"L"),(1,"R")]:
    part(N,f"sensorPod{lab}","cylinder",[.062,.045,.062],[side*.112,.095,-.005],"steel","head",[0,0,PI/2])
    part(N,f"sensorRing{lab}","torus",[.07,.07,.01],[side*.137,.095,-.005],"cyan","head",[0,0,PI/2])
    part(N,f"sensorFin{lab}","blade",[.012,.035,.19],[side*.118,.15,-.10],"ceramic","head",[-.45,side*.12,0])
    part(N,f"cheekVent{lab}","box",[.012,.03,.04],[side*.095,.01,.105],"cyanGlass","head",[0,side*.5,0])

# --- Torso armour -----------------------------------------------------------
plate(N,"chestPlate",CHEST,.02,.215,.022,(FRONT-1.22,FRONT+1.22),"ceramic","chest",thickness=.016,rings=6,taper=.07,segments=22)
plate(N,"sternumKeel",CHEST,.03,.20,.036,(FRONT-.07,FRONT+.07),"magenta","chest",thickness=.012,rings=5,taper=.15,segments=3)
part(N,"coreReactor","octa",[.072,.088,.04],[0,.165,.165],"cyan","chest")
for side,lab in [(-1,"L"),(1,"R")]:
    plate(N,f"pecConduit{lab}",CHEST,.05,.17,.03,mirror_arc((FRONT-.95,FRONT-.88),side),"cyan","chest",thickness=.01,rings=5,taper=0,segments=2)
    plate(N,f"latPanel{lab}",CHEST,-.02,.16,.012,mirror_arc((-.55,.35),side),"armor","chest",thickness=.012,rings=5,taper=.1)
plate(N,"backPlate",CHEST,.0,.25,.02,(BACK-1.25,BACK+1.25),"armor","chest",thickness=.016,rings=6,taper=.06,segments=22)
plate(N,"spineRidge",CHEST,-.01,.26,.034,(BACK-.06,BACK+.06),"cyan","chest",thickness=.012,rings=6,taper=0,segments=3)
part(N,"reactorRing","torus",[.15,.15,.022],[0,.12,-.152],"ceramic","chest",[PI/2,0,0])
part(N,"reactorHeart","octa",[.07,.1,.05],[0,.12,-.16],"cyan","chest")
for side,lab in [(-1,"L"),(1,"R")]:
    part(N,f"thrusterPort{lab}","cylinder",[.05,.05,.11],[side*.09,.02,-.14],"steel","chest",[-.35,0,0])
    part(N,f"thrusterGlow{lab}","cylinder",[.034,.034,.02],[side*.09,-.03,-.155],"magenta","chest",[-.35,0,0])
plate(N,"collar",CHEST,.235,.29,.03,(0,2*PI),"armor","chest",thickness=.014,rings=3,taper=0,segments=28)
for i,(y0,y1) in enumerate([(.0,.06),(.075,.135),(.15,.215)]):
    plate(N,f"abPlate{i}",ABDOMEN,y0,y1,.016,(FRONT-.95,FRONT+.95),"armor" if i!=1 else "ceramic","spine",thickness=.012,rings=3,taper=.0,segments=14)
plate(N,"belt",PELVIS,.03,.095,.014,(0,2*PI),"steel","hips",thickness=.012,rings=3,taper=0,segments=28)
part(N,"beltCore","octa",[.06,.05,.03],[0,.062,.13],"cyan","hips")
for side,lab in [(-1,"L"),(1,"R")]:
    plate(N,f"tasset{lab}",PELVIS,-.10,.03,.03,mirror_arc((-.6,.55),side),"armor","hips",thickness=.012,rings=4,taper=.1,segments=10)
    part(N,f"tassetLight{lab}","box",[.012,.08,.02],[side*.19,-.03,.05],"magenta","hips")
plate(N,"codPlate",PELVIS,-.12,.02,.014,(FRONT-.45,FRONT+.45),"armor","hips",thickness=.012,rings=4,taper=.15,segments=10)

# --- Katana sheath across the back -----------------------------------------
SHEATH=[[-.47,.03,.02,0,2.4],[-.42,.05,.032,0,2.6],[.40,.055,.034,0,2.6],[.44,.05,.03,0,2.4]]
body(N,"sheath",SHEATH,"void","chest",at=(.0,.12,-.18),rotation=[0,0,.72],segments=12)
for i,y in enumerate([-.3,.05,.32]):
    part(N,f"sheathBand{i}","box",[.065,.018,.042],[-math.sin(.72)*y,.12+math.cos(.72)*y,-.18],"cyan" if i==1 else "steel","chest",[0,0,.72])

# --- Arms -------------------------------------------------------------------
for side,lab in [(-1,"L"),(1,"R")]:
    ua,fa,hand=(f"{'left' if side<0 else 'right'}{g}" for g in ("UpperArm","ForeArm","Hand"))
    body(N,f"upperArm{lab}",UPPER_ARM,"suit",ua,segments=20)
    # Dome pauldron, open on the inner side, layered with a second lame.
    DOME=[[-.11,.16,.16,0,2.3],[-.04,.18,.175,0,2.3],[.02,.168,.162,0,2.3],[.065,.12,.12,0,2.1],[.088,.05,.055,0,2.0]]
    part(N,f"pauldron{lab}","shell",bbox(DOME),[side*.012,0,0],"ceramic",ua,
         profile=DOME,arc=list(mirror_arc((-1.75,1.75),side)),thickness=.014,segments=20)
    LAME=[[-.15,.15,.15,0,2.3],[-.10,.162,.16,0,2.3],[-.06,.15,.15,0,2.3]]
    part(N,f"pauldronLame{lab}","shell",bbox(LAME),[side*.016,0,0],"armor",ua,
         profile=LAME,arc=list(mirror_arc((-1.4,1.4),side)),thickness=.012,segments=16)
    part(N,f"shoulderLight{lab}","box",[.014,.05,.07],[side*.098,.0,0],"cyan",ua)
    plate(N,f"bicepGuard{lab}",UPPER_ARM,-.25,-.12,.012,mirror_arc((-1.1,1.1),side),"armor",ua,rings=4,taper=.08,segments=14)
    part(N,f"elbowGuard{lab}","sphere",[.075,.07,.06],[0,-.29,-.03],"steel",ua)
    body(N,f"foreArm{lab}",FOREARM,"suit",fa,segments=20)
    plate(N,f"bracer{lab}",FOREARM,-.21,-.035,.013,mirror_arc((-1.9,1.9),side),"ceramic",fa,thickness=.014,rings=5,taper=.06,segments=20)
    plate(N,f"bracerConduit{lab}",FOREARM,-.2,-.05,.026,mirror_arc((-.04,.04),side),"magenta" if side<0 else "cyan",fa,thickness=.01,rings=4,taper=0,segments=2)
    part(N,f"wristEmitter{lab}","torus",[.082,.07,.014],[0,-.228,0],"cyan",fa)
    # Hand: thin palm with four curled fingers and an opposed thumb.
    PALM=[[0.0,.035,.072,0,2.6],[-.05,.032,.088,.004,3],[-.095,.028,.086,.006,3]]
    body(N,f"palm{lab}",PALM,"suit",hand,segments=16)
    for i,z in enumerate([.03,.01,-.01,-.03]):
        length=[.075,.085,.08,.065][i]
        FINGER=[[-.09,.022,.02,0,2],[-.09-length*.55,.02,.018,.012,2],[-.09-length,.016,.016,.028,2]]
        body(N,f"finger{lab}{i}",FINGER,"suit",hand,at=(0,0,z),segments=8)
    THUMB=[[0,.022,.022,0,2],[-.04,.02,.02,0,2],[-.07,.017,.017,0,2]]
    body(N,f"thumb{lab}",THUMB,"suit",hand,at=(side*-.012,-.025,.045),rotation=[.6,0,0],segments=8)
    plate(N,f"gauntlet{lab}",PALM,-.085,0,.01,mirror_arc((-.95,.95),side),"armor",hand,thickness=.01,rings=3,taper=.0,segments=10)
    part(N,f"knuckleLight{lab}","box",[.008,.012,.07],[side*.026,-.088,0],"cyan",hand)

# --- Legs -------------------------------------------------------------------
for side,lab in [(-1,"L"),(1,"R")]:
    th,sh,ft=(f"{'left' if side<0 else 'right'}{g}" for g in ("Thigh","Shin","Foot"))
    body(N,f"thigh{lab}",THIGH,"suit",th,segments=22)
    plate(N,f"thighPlate{lab}",THIGH,-.33,-.05,.014,mirror_arc((FRONT-1.85,FRONT+.75),side),"armor",th,thickness=.014,rings=6,taper=.06,segments=20)
    plate(N,f"thighConduit{lab}",THIGH,-.3,-.07,.03,mirror_arc((.15,.21),side),"magenta",th,thickness=.01,rings=5,taper=0,segments=2)
    plate(N,f"kneeCap{lab}",THIGH,-.455,-.37,.018,(FRONT-.85,FRONT+.85),"ceramic",th,thickness=.016,rings=4,taper=.15,segments=14)
    part(N,f"kneeLight{lab}","octa",[.034,.034,.02],[0,-.41,.075],"magenta",th)
    body(N,f"shin{lab}",SHIN,"suit",sh,segments=22)
    plate(N,f"greave{lab}",SHIN,-.36,-.04,.014,(FRONT-1.25,FRONT+1.25),"ceramic",sh,thickness=.014,rings=6,taper=.05,segments=20)
    plate(N,f"shinRidge{lab}",SHIN,-.34,-.06,.03,(FRONT-.05,FRONT+.05),"cyan",sh,thickness=.01,rings=5,taper=0,segments=3)
    plate(N,f"calfGuard{lab}",SHIN,-.28,-.06,.012,(BACK-1.0,BACK+1.0),"armor",sh,thickness=.012,rings=5,taper=.08,segments=16)
    body(N,f"boot{lab}",BOOT,"armor",ft,segments=20,axis="z")
    part(N,f"toeCap{lab}","shell",[.1,.06,.12],[0,0,0],"ceramic",ft,
         profile=[[.07,.106,.082,-.04,3.2],[.12,.1,.064,-.047,3.2],[.16,.086,.05,-.055,3.0],[.19,.06,.036,-.063,2.4]],
         arc=[.15,PI-.15],thickness=.012,segments=14,axis="z")
    part(N,f"sole{lab}","box",[.096,.012,.25],[0,-.076,.055],"cyanGlass",ft)
    part(N,f"heelJet{lab}","cylinder",[.04,.04,.03],[0,-.03,-.085],"magenta",ft,[PI/2,0,0])
    CUFF=[[-.05,.096,.1,-.005,2.3],[.04,.088,.092,-.005,2.3]]
    body(N,f"ankleCuff{lab}",CUFF,"steel",ft,segments=18)

# --- Photon katana (held in the right hand, blade along local +Z) ----------
HILT=[[-.05,.032,.032,0,2],[-.04,.036,.036,0,2],[.2,.034,.034,0,2],[.215,.03,.03,0,2]]
body(N,"hilt",HILT,"void","bladePivot",segments=10,axis="z")
part(N,"pommel","octa",[.05,.05,.04],[0,0,-.065],"magenta","bladePivot")
part(N,"tsuba","torus",[.11,.075,.016],[0,0,.225],"gold","bladePivot",[PI/2,0,0])
part(N,"habaki","box",[.022,.05,.04],[0,0,.25],"ceramic","bladePivot")
part(N,"photonBlade","blade",[.014,.052,.86],[0,0,.68],"cyan","bladePivot")
part(N,"bladeSpine","box",[.008,.01,.78],[0,.024,.64],"ceramic","bladePivot")
part(N,"bladeEdge","box",[.004,.006,.8],[0,-.026,.66],"magenta","bladePivot")

# --- Scarf: a knot at the nape and two cloth tails the game animates --------
part(N,"scarfKnot","box",[.1,.07,.05],[0,0,0],"magenta","scarf")
for tail,(x,yaw) in enumerate([(-.035,.12),(.035,-.1)]):
    start=[x,0,-.02]
    for i in range(3):
        theta=-(.55+.28*i)-.05*tail
        L=.19
        direction=[math.sin(yaw)*-.2,math.sin(theta),-math.cos(theta)]
        centre=[start[k]+direction[k]*L/2 for k in range(3)]
        name="scarf"+str(i) if tail==0 else f"scarfTail{i}"
        part(N,name,"box",[.075-.012*i,.01,L+.02],[round(v,4) for v in centre],
             "magenta" if (i+tail)%2==0 else "cyan","scarf",[theta,yaw,0])
        start=[start[k]+direction[k]*L for k in range(3)]

# Drone wings and targeting reticle face the incoming runner (-Z).
part("drone", "aegisHull", "sphere", [0.96, 0.52, 0.63], [0, 0, 0], "armor")
part("drone", "lowerCarapace", "box", [0.59, 0.17, 0.52], [0, -0.24, 0], "void")
part("drone", "optic", "box", [0.53, 0.12, 0.07], [0, 0.06, -0.345], "magenta")
part("drone", "opticCore", "box", [0.10, 0.12, 0.075], [0, 0.06, -0.395], "cyan")
part("drone", "dorsalPlate", "box", [.54,.08,.37], [0,.30,0], "ceramic")
part("drone", "ventralFin", "octa", [.21,.33,.32], [0,-.35,.05], "magenta")
for side, lab in [(-1, "L"), (1, "R")]:
    part("drone", f"wing{lab}", "box", [0.82, 0.10, 0.38],
         [side * .78, .09, 0], "ceramic", rotation=[0, 0, side * -0.23])
    part("drone", f"wingTip{lab}", "box", [0.22, 0.07, 0.53],
         [side * 1.22, .13, -.08], "cyanGlass", rotation=[0, 0, side * -0.25])
    part("drone", f"rotor{lab}", "torus", [0.52, 0.52, 0.09],
         [side * 1.02, -0.055, 0], "magenta")
    part("drone", f"wingGleam{lab}", "box", [.52,.025,.055],
         [side*.77,.16,-.17], "cyanGlass")
part("drone", "targetInner", "torus", [1.86, 1.86, 0.055], [0, 0, -0.61], "magenta", rotation=[1.571, 0, 0])
part("drone", "targetOuter", "torus", [2.44, 2.44, 0.035], [0, 0, -0.64], "magenta", rotation=[1.571, 0, 0])
part("drone", "slashLeft", "box", [0.07, 0.75, 0.07], [-.19, 0, -.67], "magenta", rotation=[0, 0, -.55])
part("drone", "slashRight", "box", [0.07, 0.75, 0.07], [.19, 0, -.67], "magenta", rotation=[0, 0, .55])

for side, lab in [(-1, "L"), (1, "R")]:
    part("barrier", f"jumpBase{lab}", "box", [.18, .16, .68], [side * 1.04, .10, 0], "steel")
part("barrier", "jumpBlock", "box", [2.20, .80, .42], [0, .54, 0], "void")
part("barrier", "jumpLedge", "box", [2.28, .12, .53], [0, 1.00, 0], "red")
for side, lab in [(-1, "L"), (1, "R")]:
    part("barrier", f"jumpChevron{lab}", "box", [.10, .55, .08],
         [side * .19, 1.35, -.31], "red", rotation=[0, 0, side * .58])
    part("beam", f"laserPylon{lab}", "box", [.20, 2.35, .31],
         [side * 1.10, 1.18, 0], "armor")
    part("beam", f"laserTip{lab}", "octa", [.24, .25, .36],
         [side * 1.10, 2.38, 0], "magenta")
for height in [1.52, 1.79]:
    part("beam", f"laser{height}", "box", [2.35, .055, .16], [0, height, 0], "magenta")
part("wall", "shiftWall", "box", [2.42, 2.58, .53], [0, 1.29, 0], "void")
part("wall", "wallBorderL", "box", [.13, 2.61, .61], [-1.15, 1.29, 0], "orange")
part("wall", "wallBorderR", "box", [.13, 2.61, .61], [1.15, 1.29, 0], "orange")
for i in range(4):
    part("wall", f"shiftStripe{i}", "box", [1.95, .075, .06],
         [0, .56 + .43 * i, -.32], "orange", rotation=[0, 0, -.21])
part("shard", "dataCrystal", "octa", [.73, .94, .49], [0, 0, 0], "cyan")
part("shard", "dataHalo", "torus", [1.25, 1.25, .035], [0, 0, 0], "cyanGlass")

# Survival course hazards. Color and height preserve the jump / slide / shift
# language while their silhouettes add a more varied rooftop gauntlet.
part("spike", "spikeBed", "box", [2.42,.13,.77], [0,.07,0], "steel")
part("spike", "spikeLeadingEdge", "box", [2.50,.07,.10], [0,.13,-.40], "orange")
for i,x in enumerate([-.86,-.29,.29,.86]):
    part("spike",f"retractableTooth{i}","octa",[.35,.68,.42],[x,.47,0],"red")
    part("spike",f"toothSocket{i}","box",[.40,.075,.45],[x,.15,0],"armor")
part("spike","spikeWarning","box",[2.15,.025,.08],[0,.16,.34],"gold")

for side,lab in [(-1,"L"),(1,"R")]:
    part("sweep",f"sweepPylon{lab}","box",[.20,2.36,.34],[side*1.11,1.18,0],"armor")
    part("sweep",f"sweepAxle{lab}","cylinder",[.28,.12,.28],[side*1.1,1.55,-.24],"cyanGlass",rotation=[1.571,0,0])
    part("sweep",f"sweepCap{lab}","octa",[.28,.22,.31],[side*1.1,2.38,0],"magenta")
part("sweep","sweepCrossbar","box",[2.32,.09,.16],[0,1.51,-.03],"magenta")
part("sweep","sweepArc","box",[2.18,.055,.13],[0,1.75,.04],"cyanGlass",rotation=[0,0,.12])
for i in range(3):
    part("sweep",f"sweepWarning{i}","box",[.17,.04,.10],[-.72+i*.72,1.43,-.14],"gold")

part("crusher","crusherSlab","box",[2.47,2.70,.56],[0,1.35,0],"void")
for side,lab in [(-1,"L"),(1,"R")]:
    part("crusher",f"crusherRail{lab}","box",[.16,2.73,.64],[side*1.16,1.36,0],"steel")
    part("crusher",f"crusherPiston{lab}","cylinder",[.13,.65,.13],[side*.85,2.60,-.16],"orange")
for i in range(4):
    part("crusher",f"crusherChevron{i}","box",[.62,.075,.055],[-.72+i*.48,1.58-i*.17,-.33],"orange",rotation=[0,0,-.52])
    part("crusher",f"crusherTeeth{i}","octa",[.37,.34,.19],[-.88+i*.57,.18,-.12],"red")
part("crusher","crusherStatus","box",[1.42,.11,.06],[0,2.33,-.33],"gold")

for side,lab in [(-1,"L"),(1,"R")]:
    part("finish_gate",f"finishPylon{lab}","box",[.36,3.64,.55],[side*5.53,1.82,0],"ceramic")
    part("finish_gate",f"finishBeacon{lab}","octa",[.46,.44,.44],[side*5.53,3.78,0],"cyan")
    part("finish_gate",f"finishStripe{lab}","box",[.07,2.4,.075],[side*5.31,1.8,-.32],"magenta")
part("finish_gate","finishLintel","box",[11.24,.32,.62],[0,3.43,0],"armor")
part("finish_gate","finishLight","box",[10.78,.09,.07],[0,3.34,-.35],"cyan")
part("finish_gate","finishLine","box",[11.0,.018,.31],[0,.021,0],"gold")

# The 18 m rooftop module is repeated over every trial. The continuous ground
# in ninja-engine.ts sits slightly below this visible deck surface.
part("roof_tile", "deckSurface", "box", [12.3,.08,17.96], [0,-.04,0], "floor")
for x in [-4.5, -1.5, 1.5, 4.5]:
    part("roof_tile", f"laneRail{x}", "box", [.034, .018, 18], [x, .036, 0], "cyanGlass")
for x in [-3, 0, 3]:
    part("roof_tile", f"laneInlay{x}", "box", [2.56, .018, .12], [x, .03, 0], "steel")
for side, lab in [(-1, "L"), (1, "R")]:
    part("roof_tile", f"edgeKerb{lab}", "box", [.26, .45, 18], [side * 6.15, .15, 0], "steel")
    part("roof_tile", f"edgeEmitter{lab}", "box", [.08, .06, 18], [side * 6.05, .41, 0], "magenta")
    part("roof_tile", f"sidePylon{lab}", "box", [.34, 2.1, .42], [side * 5.92, 1.13, -7.6], "armor")
    part("roof_tile", f"sideLamp{lab}", "box", [.15, .29, .16], [side * 5.92, 2.15, -7.72], "cyan")
    part("roof_tile", f"sideBrace{lab}", "box", [.70,.08,.28],
         [side*5.83,1.65,-7.6], "ceramic")
    part("roof_tile", f"sideSignal{lab}", "box", [.12,.35,.075],
         [side*5.90,.85,-7.84], "magenta")
part("roof_tile", "crossBand", "box", [11.9, .015, .12], [0, .039, -8.75], "cyanGlass")

part("sky_tower", "towerMass", "box", [8, 25, 10], [0, 12.5, 0], "suit")
part("sky_tower", "towerCrown", "box", [8.5, .65, 10.5], [0, 25.1, 0], "steel")
for side, lab in [(-1, "L"), (1, "R")]:
    part("sky_tower", f"cornerRail{lab}", "box", [.12, 23, .14],
         [side * 3.65, 13, -5.09], "cyanGlass")
for height in [4, 7.6, 11.2, 14.8, 18.4, 22]:
    part("sky_tower", f"windowBand{height}", "box", [6.9, .28, .12],
         [0, height, -5.07], "window")
part("sky_tower", "antenna", "box", [.22, 3.2, .22], [1.7, 27, 0], "magenta")

# Drone turbines, layered face armor, exposed engines, and navigation markers.
part("drone","frontCarapace","panel",[.65,.26,.095],[0,.10,-.36],"ceramic")
assets["drone"][-1]["outline"]=[[-.5,-.4],[.5,-.4],[.34,.5],[-.34,.5]]
part("drone","aftThruster","cylinder",[.30,.20,.30],[0,-.06,.39],"cyanGlass",rotation=[1.571,0,0])
for side,lab in [(-1,"L"),(1,"R")]:
    part("drone",f"rotorCore{lab}","cylinder",[.18,.10,.18],
         [side*1.02,-.055,0],"cyan")
    part("drone",f"wingArmor{lab}","panel",[.54,.12,.12],
         [side*.81,.16,-.08],"armor",rotation=[0,0,side*-.23])
    assets["drone"][-1]["outline"]=[[-.5,-.4],[.5,-.4],[.35,.5],[-.3,.5]]
    part("drone",f"navBeacon{lab}","octa",[.15,.12,.15],
         [side*1.31,.14,-.21],"cyan")
    part("drone",f"underslungClaw{lab}","blade",[.11,.09,.27],
         [side*.43,-.32,-.08],"magenta",rotation=[-.40,side*.2,0])

# Readable obstacle silhouettes gain machined surface detail.
for i in range(6):
    part("barrier",f"barrierVent{i}","box",[.23,.035,.035],
         [-.8+i*.32,.53,-.24],"steel")
for side,lab in [(-1,"L"),(1,"R")]:
    part("barrier",f"barrierFoot{lab}","panel",[.29,.31,.19],
         [side*.95,.21,-.15],"armor")
    assets["barrier"][-1]["outline"]=[[-.5,-.5],[.5,-.5],[.30,.5],[-.30,.5]]
    part("beam",f"laserReactor{lab}","sphere",[.21,.21,.21],
         [side*1.1,1.62,0],"cyan")
    for i in range(3):
        part("beam",f"laserVent{lab}{i}","box",[.055,.24,.04],
             [side*1.1, .50+i*.33,-.19],"magenta")
for side,lab in [(-1,"L"),(1,"R")]:
    part("wall",f"wallShock{lab}","box",[.30,.33,.08],
         [side*.77,2.32,-.31],"gold")
for row in range(3):
    for col in range(4):
        part("wall",f"wallCell{row}{col}","panel",[.34,.24,.045],
             [-.64+col*.43,.67+row*.54,-.32],"steel")
        assets["wall"][-1]["outline"]=[[-.5,-.5],[.5,-.5],[.4,.5],[-.4,.5]]

# The lane edges and skyline carry real vents, deck seams and window depth.
for side,lab in [(-1,"L"),(1,"R")]:
    for index in range(3):
        part("roof_tile",f"edgeVent{lab}{index}","box",[.24,.055,.85],
             [side*6.12,.43,-5+index*5],"cyanGlass")
for lane in [-3,0,3]:
    for section in [-5,1,7]:
        part("roof_tile",f"deckSeam{lane}{section}","box",[2.40,.014,.042],
             [lane,.036,section],"steel")
for side,lab in [(-1,"L"),(1,"R")]:
    part("sky_tower",f"towerSideConduit{lab}","box",[.09,19,.13],
         [side*4.04,12,-1.1],"magenta")
for level in [3.8,7.4,11,14.6,18.2,21.8]:
    for x in [-2.4,-.8,.8,2.4]:
        part("sky_tower",f"windowCell{level}{x}","box",[.80,.26,.10],
             [x,level+.45,-5.12],"window")


# ---------------------------------------------------------------------------
# Open-city operation assets (version 4)
# ---------------------------------------------------------------------------
def disc(asset,name,diameter,height,at,material,bevel=.06):
    r=diameter;prof=[[-height/2,r*(1-bevel),r*(1-bevel),0,2],[-height/2+height*.2,r,r,0,2],
                     [height/2-height*.2,r,r,0,2],[height/2,r*(1-bevel),r*(1-bevel),0,2]]
    return body(asset,name,prof,material,"root",at=at,segments=40)


# Extraction beacon: a 6 m uplink spire that lights once objectives are done.
disc("beacon","beaconPlinth",2.6,.35,(0,.175,0),"steel")
part("beacon","beaconRing","torus",[2.9,2.9,.12],[0,.36,0],"cyan")
part("beacon","beaconCore","loft",[.7,5.2,.7],[0,0,0],"armor",
     profile=[[.35,.62,.62,0,2.0],[1.2,.42,.42,0,2.0],[4.6,.26,.26,0,2.0],[5.4,.06,.06,0,2.0]],segments=6,axis="y")
part("beacon","beaconCrystal","octa",[.55,1.1,.55],[0,5.9,0],"cyan")
for i in range(3):
    a=i*2*PI/3
    part("beacon",f"beaconFin{i}","blade",[.08,.32,2.6],[math.cos(a)*.62,2.2,math.sin(a)*.62],"ceramic",rotation=[-PI/2+.12,0,0])
    part("beacon",f"beaconLight{i}","box",[.05,2.2,.05],[math.cos(a)*.42,2.6,math.sin(a)*.42],"magenta")
for h in [1.6,3.0,4.3]:
    part("beacon",f"beaconHalo{h}","torus",[1.5-h*.18,1.5-h*.18,.035],[0,h,0],"cyanGlass")

# Jump pad: launches the operative to higher rooftops.
disc("jump_pad","padBase",2.2,.22,(0,.11,0),"steel")
part("jump_pad","padRing","torus",[2.0,2.0,.09],[0,.24,0],"magenta")
disc("jump_pad","padCore",1.3,.06,(0,.25,0),"cyan",bevel=.02)
for i in range(4):
    a=i*PI/2+PI/4
    part("jump_pad",f"padChevron{i}","octa",[.22,.06,.34],[math.cos(a)*.78,.27,math.sin(a)*.78],"gold",rotation=[0,-a+PI/2,0])

# Repair cell: restores integrity.
part("repair_cell","cellCore","capsule",[.26,.52,.26],[0,0,0],"cyanGlass")
part("repair_cell","cellCross","box",[.34,.09,.09],[0,0,0],"red")
part("repair_cell","cellCrossV","box",[.09,.34,.09],[0,0,0],"red")
disc("repair_cell","cellCapTop",.3,.07,(0,.27,0),"ceramic")
disc("repair_cell","cellCapBottom",.3,.07,(0,-.27,0),"ceramic")

# ---------------------------------------------------------------------------
# Warden: the sector boss. A 3.5 m wide hovering siege machine. Parts named
# wardenRing*, wardenEye, cannon*, shield* are animated by the game.
# ---------------------------------------------------------------------------
W="warden"
CORE=[[-1.05,.35,.35,0,2],[-.85,.95,.95,0,2.2],[-.4,1.45,1.45,0,2.4],[.15,1.6,1.6,0,2.5],
      [.6,1.38,1.38,0,2.4],[.95,.9,.9,0,2.2],[1.15,.3,.3,0,2]]
body(W,"wardenCore",CORE,"armor","root",segments=36)
plate(W,"wardenBrow",CORE,.25,.75,.05,(FRONT-1.1,FRONT+1.1),"ceramic","root",thickness=.05,rings=5,taper=.08,segments=24)
plate(W,"wardenJaw",CORE,-.75,-.2,.05,(FRONT-1.0,FRONT+1.0),"ceramic","root",thickness=.05,rings=5,taper=.08,segments=24)
plate(W,"wardenBackShell",CORE,-.6,.8,.04,(BACK-1.3,BACK+1.3),"steel","root",thickness=.05,rings=6,taper=.06,segments=24)
plate(W,"wardenVisorSlit",CORE,-.12,.18,.02,(FRONT-.9,FRONT+.9),"void","root",thickness=.04,rings=3,taper=0,segments=24)
part(W,"wardenEye","sphere",[.42,.3,.2],[0,.03,.8],"red")
part(W,"wardenPupil","sphere",[.16,.16,.08],[0,.03,.89],"gold")
for k in range(3):
    part(W,f"wardenRing{k}","torus",[2.4+k*.55,2.4+k*.55,.07-.015*k],[0,-.05+k*.12,0],["cyan","magenta","cyanGlass"][k],rotation=[.25*(k-1),0,.12*(k-1)])
for i in range(4):
    a=i*PI/2+PI/4;cx,cz=math.cos(a)*1.25,math.sin(a)*1.25
    part(W,f"pylon{i}","box",[.32,.32,.95],[cx,-.15,cz],"steel",rotation=[0,-a+PI/2,0])
    part(W,f"cannon{i}","loft",[.2,.2,.9],[cx*1.35,-.25,cz*1.35],"armor",rotation=[0,-a+PI/2,0],
         profile=[[-.45,.18,.18,0,2],[-.3,.24,.24,0,2.4],[.3,.2,.2,0,2.4],[.45,.12,.12,0,2]],segments=14,axis="z")
    part(W,f"cannonMuzzle{i}","torus",[.17,.17,.04],[cx*1.35+math.cos(a)*.45,-.25,cz*1.35+math.sin(a)*.45],"orange",rotation=[PI/2,-a+PI/2,0])
    part(W,f"shieldFin{i}","blade",[.06,.5,1.4],[math.cos(a+PI/4)*1.0,.75,math.sin(a+PI/4)*1.0],"ceramic",rotation=[-1.2,-(a+PI/4)+PI/2,0])
    part(W,f"thruster{i}","cylinder",[.26,.3,.26],[math.cos(a)*.55,-1.0,math.sin(a)*.55],"steel")
    part(W,f"thrusterGlow{i}","cylinder",[.2,.06,.2],[math.cos(a)*.55,-1.17,math.sin(a)*.55],"cyan")
for i in range(5):
    a=i*2*PI/5
    part(W,f"crownSpike{i}","octa",[.14,.55,.14],[math.cos(a)*.3,1.3,math.sin(a)*.3],"magenta",rotation=[math.sin(a)*.3,0,-math.cos(a)*.3])
part(W,"crownCore","octa",[.3,.4,.3],[0,1.3,0],"cyan")
for i,y in enumerate([-.45,-.25]):
    part(W,f"bellyLight{i}","torus",[1.1-i*.3,1.1-i*.3,.03],[0,y-.45,0],"magenta")

spec = {
    "version": VERSION, "units": "metres", "forward": "+Z",
    "palette": palette, "groups": groups, "assets": assets,
    "dimensions": {"ninjaHeight": 1.92, "ninjaShoulderWidth": 0.56,
                   "droneWingspan": 2.66, "roofWidth": 12.3, "laneCentres": [-3, 0, 3],
                   "roofModuleLength": 18},
}
for asset_parts in assets.values():
    for item in asset_parts:item["mesh"]=build_mesh(item,palette)
make_textures()
(ROOT / "app" / "blueprint-spec.json").write_text(json.dumps(spec, separators=(",", ":")) + "\n")
print(f"Wrote blueprint-spec.json: {sum(len(v) for v in assets.values())} parts, "
      f"{sum(len(p['mesh']['indices'])//3 for parts in assets.values() for p in parts)} triangles; "
      f"ninja {len(assets['ninja'])} parts / {sum(len(p['mesh']['indices'])//3 for p in assets['ninja'])} triangles")
