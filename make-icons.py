# Draws the FreeGram icon (green paper plane with a broken tip on black).
# Usage: python3 make-icons.py           -> icon.png, www/icon.png
#        python3 make-icons.py android   -> also writes Android mipmaps (run after "cap add android")
import sys,os
from PIL import Image,ImageDraw
S=2048;K=S/1024
L=(170,500);N=(440,640);B=(560,820)
J=[(790,248),(768,282),(806,306),(776,338),(790,360)];Kc=(786,294)
LIGHT=[L,J[0],J[1],Kc,N];DARK=[N,Kc,J[2],J[3],J[4],B];SHARD=[(870,215),(925,185),(905,245)]
def plane(size,scale,bg):
    im=Image.new('RGBA',(S,S),bg);d=ImageDraw.Draw(im)
    f=lambda pts:[(512*K+(x-512)*K*scale,512*K+(y-512)*K*scale) for x,y in pts]
    d.polygon(f(LIGHT),fill=(61,220,132,255));d.polygon(f(DARK),fill=(31,150,88,255));d.polygon(f(SHARD),fill=(61,220,132,255))
    return im.resize((size,size),Image.LANCZOS)
BLACK=(0,0,0,255)
here=os.path.dirname(os.path.abspath(__file__));os.makedirs(os.path.join(here,'www'),exist_ok=True)
plane(1024,1,BLACK).save(os.path.join(here,'icon-1024.png'))
plane(512,1,BLACK).save(os.path.join(here,'icon.png'))
plane(192,1,BLACK).save(os.path.join(here,'www','icon.png'))
if len(sys.argv)>1 and sys.argv[1]=='android':
    res=os.path.join(here,'android','app','src','main','res')
    for dn,px in {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}.items():
        d=os.path.join(res,'mipmap-'+dn);os.makedirs(d,exist_ok=True)
        plane(px,1,BLACK).save(os.path.join(d,'ic_launcher.png'));plane(px,1,BLACK).save(os.path.join(d,'ic_launcher_round.png'))
        plane(px*9//4,.62,(0,0,0,0)).save(os.path.join(d,'ic_launcher_foreground.png'))
    v=os.path.join(res,'values');os.makedirs(v,exist_ok=True)
    open(os.path.join(v,'ic_launcher_background.xml'),'w').write('<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#000000</color></resources>')
