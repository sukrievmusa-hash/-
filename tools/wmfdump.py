import struct, sys
def recs(b):
    off=0
    if struct.unpack_from('<I',b,0)[0]==0x9AC6CDD7: off=22
    hdr=struct.unpack_from('<HHHIHIH',b,off); off+=hdr[1]*2
    while off<len(b):
        size,fn=struct.unpack_from('<IH',b,off)
        if size<3: break
        yield fn, b[off+6:off+size*2]
        off+=size*2
        if fn==0: break
NAMES={0x020B:'SetWindowOrg',0x020C:'SetWindowExt',0x02FB:'CreateFont',0x012D:'SelectObject',0x01F0:'DeleteObject',0x0521:'TextOut',0x0A32:'ExtTextOut',0x0325:'Polyline',0x0324:'Polygon',0x0214:'MoveTo',0x0213:'LineTo',0x02FA:'CreatePen',0x02FC:'CreateBrush',0x0209:'SetTextColor',0x012E:'SetTextAlign',0x0102:'SetBkMode',0x0418:'Ellipse',0x041B:'Rectangle',0x0538:'PolyPolygon'}
if __name__=='__main__':
    b=open('x/word/media/%s.wmf'%sys.argv[1],'rb').read()
    for fn,p in recs(b):
        n=NAMES.get(fn,hex(fn))
        if fn==0x02FB:
            h,w=struct.unpack_from('<hh',p,0); face=p[18:50].split(b'\0')[0]; print(n,h,'w',struct.unpack_from('<h',p,8)[0],'it',p[10],'cs',p[14],face)
        elif fn==0x0A32:
            y,x,cnt,opt=struct.unpack_from('<hhhH',p,0); s=p[8+(8 if opt&6 else 0):][:cnt]; print(n,x,y,s, [hex(c) for c in s])
        elif fn==0x0521:
            cnt=struct.unpack_from('<h',p,0)[0]; s=p[2:2+cnt]; y,x=struct.unpack_from('<hh',p,2+cnt+(cnt&1)); print(n,x,y,s)
        else: print(n, p[:16].hex())
