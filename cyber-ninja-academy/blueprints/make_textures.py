"""Deterministic microfinish maps shared by Babylon and the blueprint renderer."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'blueprint-textures'
OUT.mkdir(parents=True,exist_ok=True)


def texture(kind,size=512):
    rng=np.random.default_rng({'suit':41,'armor':61,'ceramic':83,'steel':107,'floor':127,'void':139}[kind])
    y,x=np.mgrid[:size,:size]
    grain=rng.normal(0,2.5,(size,size))
    if kind in ('suit','void'):
        warp=((x+y)//7)%2
        weft=((x-y)//7)%2
        directional=warp*5+weft*4+(np.sin((x+y)*.85)+np.sin((x-y)*.85))*2
        base=214 if kind=='suit' else 225
        finish=base+directional+grain
    elif kind=='armor':
        brushed=np.sin((x*.36+y*.11))*2.5+np.sin(x*.09)*2
        finish=228+brushed+grain
    elif kind=='ceramic':
        brushed=np.sin(x*.24+y*.025)*1.5
        finish=242+brushed+grain*.55
    elif kind=='steel':
        finish=225+np.sin((x+y)*.31)*3+grain
    else:
        seam=((x%128)<3)|((y%128)<3)
        inset=((x%128)<9)|((y%128)<9)
        finish=220+grain+np.sin((x+y)*.05)*2
        finish[inset]-=5;finish[seam]-=30
        bolt=((x%128-13)**2+(y%128-13)**2)<9
        finish[bolt]+=18
    # Sparse deterministic micro-scratches, worn more heavily on metal.
    if kind in ('armor','steel','ceramic'):
        for _ in range(170 if kind!='ceramic' else 65):
            sx=int(rng.integers(0,size));sy=int(rng.integers(0,size))
            length=int(rng.integers(4,24));end=min(size,sx+length)
            finish[sy,sx:end]-=rng.uniform(4,13)
    data=np.clip(finish,155,254).astype(np.uint8)
    image=Image.fromarray(np.stack([data]*3,axis=-1),'RGB')
    image.save(OUT/f'{kind}-finish.png',optimize=True)


def make_all():
    for name in ('suit','armor','ceramic','steel','floor','void'):texture(name)


if __name__=='__main__':make_all()
