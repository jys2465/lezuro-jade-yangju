# tools/app.src.css(px) → css/app.css(rem). 글씨 크기 조절이 모든 크기에 함께 적용되도록 합니다.
import re
src = open('tools/app.src.css', encoding='utf-8').read()
def conv(m):
    sign, num = m.group(1), m.group(2)
    v = float(num)
    if v <= 2: return sign + num + 'px'          # 1px·2px 같은 가는 선과 작은 어긋남은 그대로
    return sign + ('%g' % round(v / 16, 4)) + 'rem'
out = re.sub(r'(?<![\w.#-])(-?)(\d+(?:\.\d+)?)px', conv, src)
open('css/app.css', 'w', encoding='utf-8').write(out)
print('css', len(out))
