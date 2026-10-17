# 홈 화면 아이콘: 연두 바탕 + 진한 초록 네 꼭지 별 (PIL 없이 직접 PNG 작성)
import zlib, struct, math
BG=(0xB4,0xE2,0x6C); FG=(0x1E,0x4A,0x2A)
def star_pts(cx,cy,R,r):
    pts=[]
    for i in range(8):
        a=math.pi/4*i - math.pi/2
        rad=R if i%2==0 else r
        pts.append((cx+rad*math.cos(a),cy+rad*math.sin(a)))
    return pts
def inside(x,y,poly):
    c=False; n=len(poly)
    for i in range(n):
        x1,y1=poly[i]; x2,y2=poly[(i+1)%n]
        if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: c=not c
    return c
def png(size,path):
    poly=star_pts(size/2,size/2,size*0.34,size*0.085)
    ss=4; rows=[]
    for y in range(size):
        row=bytearray([0])
        for x in range(size):
            hit=0
            for sy in range(ss):
                for sx in range(ss):
                    if inside(x+(sx+.5)/ss,y+(sy+.5)/ss,poly): hit+=1
            t=hit/(ss*ss)
            row+=bytes(round(BG[i]*(1-t)+FG[i]*t) for i in range(3))
        rows.append(bytes(row))
    raw=b''.join(rows)
    def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
    open(path,'wb').write(data)
for s in (180,192,512): png(s,f'icon-{s}.png')
print('ok')
