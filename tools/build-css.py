import re,sys
src=open('tools/app.src.css',encoding='utf-8').read()
def conv(m):
    v=float(m.group(1))
    if v<=2: return m.group(0)          # 1px 같은 가는 선은 그대로
    r=round(v/16,4)
    return (('%g'%r)+'rem')
out=re.sub(r'(?<![\w.#-])(-?\d+(?:\.\d+)?)px',lambda m:conv(m) if not m.group(1).startswith('-') else '-'+conv(re.match(r'(\d+(?:\.\d+)?)',m.group(1)[1:])) ,src)
open('css/app.css','w',encoding='utf-8').write(out)
print('css',len(out))
