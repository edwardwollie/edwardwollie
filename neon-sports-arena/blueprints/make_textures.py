"""Deterministic microfinish maps shared by Babylon and the blueprint renderer."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'blueprint-textures'
OUT.mkdir(parents=True,exist_ok=True)
KINDS=('suit','jersey','armor','ceramic','steel','floor','concrete','net')
SEEDS={k:41+i*22 for i,k in enumerate(KINDS)}


def texture(kind,size=512):
    rng=np.random.default_rng(SEEDS[kind])
    y,x=np.mgrid[:size,:size]
    grain=rng.normal(0,2.4,(size,size))
    if kind=='suit':
        # Compression knit: fine diagonal twill.
        twill=((x+y)//5)%2*4+((x-y)//9)%2*3
        finish=214+twill+grain
    elif kind=='jersey':
        # Athletic mesh: staggered perforations on a smooth knit.
        cell=16
        cx=(x%cell)-cell/2;cy=((y+((x//cell)%2)*cell//2)%cell)-cell/2
        hole=(cx**2+cy**2)<8
        finish=236+grain*.7+np.sin(y*.6)*1.5
        finish[hole]-=26
    elif kind=='armor':
        brushed=np.sin((x*.36+y*.11))*2.5+np.sin(x*.09)*2
        finish=228+brushed+grain
    elif kind=='ceramic':
        finish=243+np.sin(x*.24+y*.025)*1.4+grain*.5
    elif kind=='steel':
        finish=225+np.sin((x+y)*.31)*3+grain
    elif kind=='floor':
        # Arena deck: 1.8 m panels with a hex micro pattern and bolt heads.
        seam=((x%128)<2)|((y%128)<2)
        hx=(x%32)-16;hy=(y%28)-14
        hexline=(np.abs(hx)+np.abs(hy)*.58>13)&(np.abs(hx)+np.abs(hy)*.58<14.2)
        finish=224+grain+np.sin((x+y)*.05)*2
        finish[hexline]-=10;finish[seam]-=34
        bolt=((x%128-10)**2+(y%128-10)**2)<7
        finish[bolt]+=16
    elif kind=='concrete':
        finish=214+grain*1.6+np.sin(x*.03)*3
        finish[(y%64)<2]-=20
    else:  # net: hexagonal holographic lattice, bright lines on dark field
        hx=(x%24)-12;hy=(y%42)-21
        d=np.maximum(np.abs(hx)*.87+np.abs(hy)*.5,np.abs(hy))
        line=np.abs(d-10.5)<1.4
        finish=np.full((size,size),70.0)+grain
        finish[line]=250
    if kind in ('armor','steel','ceramic'):
        for _ in range(150 if kind!='ceramic' else 55):
            sx=int(rng.integers(0,size));sy=int(rng.integers(0,size))
            length=int(rng.integers(4,22));end=min(size,sx+length)
            finish[sy,sx:end]-=rng.uniform(4,12)
    data=np.clip(finish,40 if kind=='net' else 150,254).astype(np.uint8)
    Image.fromarray(np.stack([data]*3,axis=-1),'RGB').save(OUT/f'{kind}-finish.png',optimize=True)


def make_all():
    for name in KINDS:texture(name)


if __name__=='__main__':make_all()
