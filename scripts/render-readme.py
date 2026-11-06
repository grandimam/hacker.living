#!/usr/bin/env python3
"""Render the README animation. Requires Pillow; uses local system fonts.
Run: python3 scripts/render-readme.py [output-directory]
"""
from pathlib import Path
import math
import sys
from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'docs/assets'
OUT.mkdir(parents=True, exist_ok=True)
W, H, FPS, SECONDS = 1200, 660, 12, 8
OUTPUT_SIZE = (960, 528)
NARRATIVE_SECONDS = 15
BG = '#f7f5ee'
INK = '#272820'
MUTED = '#73756a'
LINE = '#dedfd4'
PAPER = '#fffef9'
ORANGE = '#ed5b2a'
GREEN = '#50785a'
PALE = '#eff2e9'
FONT_ROOT = Path('/System/Library/Fonts/Supplemental')
FALLBACK = Path('/usr/share/fonts/truetype/dejavu')
def font(size, kind='sans'):
    mac = {'sans': 'Arial.ttf', 'bold': 'Arial Bold.ttf', 'serif': 'Georgia.ttf'}
    linux = {'sans': 'DejaVuSans.ttf', 'bold': 'DejaVuSans-Bold.ttf', 'serif': 'DejaVuSerif.ttf'}
    path = FONT_ROOT / mac[kind]
    if not path.exists(): path = FALLBACK / linux[kind]
    return ImageFont.truetype(str(path), size)
F = {(s,k):font(s,k) for s in [11,12,13,14,15,16,17,18,20,22,24,28,38,44] for k in ['sans','bold','serif']}
def clamp(n): return max(0, min(1,n))
def ease(n):
    n=clamp(n)
    return n*n*(3-2*n)
def mix(a,b,t):
    a=tuple(bytes.fromhex(a.lstrip('#'))); b=tuple(bytes.fromhex(b.lstrip('#')))
    return tuple(round(x+(y-x)*t) for x,y in zip(a,b))
def draw_frame(t):
    im = Image.new('RGB',(W,H),BG)
    d = ImageDraw.Draw(im)
    def txt(x,y,text,size=16,color=INK,kind='sans'):
        d.text((x,y),text,font=F[size,kind],fill=color)
    def rr(box,fill=PAPER,stroke=LINE,r=16,width=1): d.rounded_rectangle(box,r,fill=fill,outline=stroke,width=width)
    def line(points,color=LINE,width=2): d.line(points,fill=color,width=width)
    def pill(x,y,text,fill=PALE,color=GREEN):
        w=d.textlength(text,font=F[12,'bold'])+22
        rr((x,y,x+w,y+26),fill,fill,13)
        txt(x+11,y+6,text,12,color,'bold')
    def check(x,y,active=True):
        d.ellipse((x,y,x+18,y+18),fill=GREEN if active else LINE)
        if active: line([(x+4,y+9),(x+8,y+13),(x+14,y+5)],PAPER,2)
    def packet(x1,x2,y,start,end):
        line([(x1,y),(x2,y)],LINE,2)
        line([(x2-5,y-4),(x2,y),(x2-5,y+4)],LINE,2)
        if start<=t<=end:
            p=(t-start)/(end-start)
            for offset in [0,.32,.64]:
                q=(p*2+offset)%1
                x=x1+(x2-x1)*q
                d.ellipse((x-4,y-4,x+4,y+4),fill=ORANGE)
    # Header: stable even when GIF playback is unavailable.
    rr((0,0,W-1,H-1),BG,LINE,22)
    txt(32,27,'HACKER.LIVING   /   THE PIPELINE',12,ORANGE,'bold')
    pill(965,22,'BUILT WITH LLMs',INK,PAPER)
    txt(32,65,'From conversation to discovery.',44,INK,'serif')
    txt(33,126,'Coding agents read, research, and save. Every result keeps its source.',18,MUTED)
    # Stage tabs
    for x,n,title in [(32,'01','THE CONVERSATIONS'),(424,'02','THE MODEL WORKERS'),(848,'03','THE LIVE CATALOG')]:
        txt(x,181,n,12,ORANGE,'bold'); txt(x+26,181,title,12,MUTED,'bold')
    for x,w in [(32,320),(424,352),(848,320)]:
        rr((x,213,x+w,545))
    # Source cards with subtle continuous motion.
    rr((49,230,83,264),ORANGE,ORANGE,8)
    txt(59,235,'Y',22,PAPER,'bold'); txt(94,232,'Hacker News',18,INK,'bold')
    txt(94,255,'People sharing what they love',12,MUTED)
    source_y=[292,369,446]
    for i,y in enumerate(source_y):
        selected = (int(t/2.6)%3)==i and t<8
        rr((49,y,335,y+65),'#fff0e5' if selected else BG,'#efc4ac' if selected else BG,8)
        txt(62,y+12,['A place worth visiting','A typeface worth trying','The reason it matters'][i],15,INK,'bold')
        txt(62,y+37,['recommendation + discussion','experience + preference','author + date + source link'][i],12,MUTED)
        if selected:
            p=(t/2.6)%1
            line([(62,y+60),(62+int(256*p),y+60)],ORANGE,2)
    # Agent surface: dark terminal with an animated processor orbit.
    rr((440,230,760,319),INK,INK,12)
    cx,cy=475,267
    for j in range(8):
        angle=t*1.4+j*math.tau/8
        x=cx+17*math.cos(angle); y=cy+17*math.sin(angle)
        d.ellipse((x-2,y-2,x+2,y+2),fill=ORANGE if j<3 else '#818575')
    txt(507,243,'Codex',22,PAPER,'bold')
    txt(507,276,'Claude · optional adapter',12,'#c3c7b7')
    stages=[('Extract','Structured recommendations',2.1),('Research','Official sources + location',5.1),('Save','Validate + commit to PostgreSQL',8.1)]
    for i,(title,sub,begin) in enumerate(stages):
        y=338+i*59
        done=t>=begin+2.1
        active=begin<=t<begin+2.1
        if active: rr((440,y-5,760,y+49),'#fff0e5','#fff0e5',8)
        check(454,y+8,done)
        if active:
            d.arc((452,y+6,474,y+28),t*240,t*240+240,fill=ORANGE,width=2)
        txt(488,y,title,16,INK,'bold'); txt(488,y+23,sub,12,MUTED)
    # Data moving between panels.
    packet(360,416,375,0,9)
    packet(784,840,375,8.1,13.8)
    # Catalog card, light map illustration before/during reveal.
    txt(866,233,'hacker.living',18,INK,'serif')
    d.ellipse((1138,238,1146,246),fill=GREEN)
    rr((865,269,1151,402),'#e8eddf','#e8eddf',10)
    # Stylized map grid, clipped within map panel.
    for x in range(884,1140,36): line([(x,277),(x,394)],'#d7dfcc',1)
    for y in range(286,397,27): line([(873,y),(1143,y)],'#d7dfcc',1)
    line([(873,374),(938,328),(1000,354),(1080,290),(1143,314)],PAPER,6)
    line([(917,277),(945,314),(1034,345),(1090,394)],PAPER,6)
    line([(1070,277),(1026,304),(1039,340),(995,394)],'#c7d8d1',10)
    reveal=ease((t-9.0)/1.2)
    if reveal:
        for j,(x,y) in enumerate([(941,320),(1075,339),(1000,367)]):
            r=round((6 if j else 8)*ease((t-9-j*.45)/.65))
            if r:
                if j==0 and t<12:
                    pulse=(t*1.4)%1
                    rad=round(8+pulse*15)
                    d.ellipse((x-rad,y-rad,x+rad,y+rad),outline=mix(ORANGE,'#e8eddf',pulse),width=2)
                d.ellipse((x-r-2,y-r-2,x+r+2,y+r+2),fill=PAPER)
                d.ellipse((x-r,y-r,x+r,y+r),fill=ORANGE)
    pill(875,279,'DRAFT PREVIEW',PAPER,MUTED)
    rr((865,416,1151,463),BG,BG,8)
    txt(877,423,'Places to explore',15,INK if t>=9.2 else MUTED,'bold')
    txt(877,444,'Map + research + original HN source',11,MUTED)
    rr((865,474,1151,526),BG,BG,8)
    txt(877,480,'Aa',28,ORANGE if t>=10.4 else MUTED,'serif')
    txt(925,482,'Typefaces to try',15,INK if t>=10.4 else MUTED,'bold')
    txt(925,505,'Context + original HN source',11,MUTED)
    if t>=11:
        check(1122,428);check(1122,489)
    # A source thread ties the complete process together.
    line([(48,566),(1152,566)],LINE,1)
    status = ('Reading saved conversations' if t<2.1 else 'Extracting recommendations' if t<5.1 else 'Researching places and checking evidence' if t<8.1 else 'Saving validated results' if t<11 else 'Saved discoveries are available on the site')
    d.ellipse((33,588,40,595),fill=ORANGE if t<11 else GREEN)
    txt(49,582,status,15,INK,'bold')
    txt(33,620,'ILLUSTRATED WORKFLOW · SOURCE CREDIT PRESERVED · PREVIEWS REQUIRE REVIEW',11,MUTED)
    # Compact stage progress, no artificial throughput counters.
    for i in range(5):
        x=1008+i*32
        rr((x,588,x+24,592),ORANGE if t>i*2.5 else LINE,ORANGE if t>i*2.5 else LINE,2)
    return im

frames=[]
for index in range(FPS*SECONDS):
    t=index/FPS * NARRATIVE_SECONDS / SECONDS
    frame=draw_frame(t)
    # Fade to the start for a gentle loop; keep the header still.
    if t>14:
        frame=Image.blend(frame,draw_frame(0),ease(t-14))
    frames.append(frame.resize(OUTPUT_SIZE, Image.Resampling.LANCZOS))
# A common palette prevents color flicker. Sample the whole narrative.
samples=[frames[round(fraction*(len(frames)-1))] for fraction in [0,.2,.4,.6,.8]]
width,height=OUTPUT_SIZE
sheet=Image.new('RGB',(width,height*len(samples)))
for i,frame in enumerate(samples): sheet.paste(frame,(0,i*height))
palette=sheet.quantize(colors=128,method=Image.Quantize.MEDIANCUT)
quantized=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
quantized[0].save(OUT/'pipeline.gif',save_all=True,append_images=quantized[1:],duration=[80,80,90]*(len(frames)//3),loop=0,optimize=True,disposal=1)
frames[round(.8*(len(frames)-1))].save(OUT/'pipeline-poster.png',optimize=True)
preview=Image.new('RGB',(width,3*height))
for i,fraction in enumerate([.07,.44,.82]): preview.paste(frames[round(fraction*(len(frames)-1))],(0,height*i))
preview.save(OUT/'pipeline-preview.png')
print(f'{len(frames)} frames; {(OUT/"pipeline.gif").stat().st_size / 1024 / 1024:.2f} MiB')
