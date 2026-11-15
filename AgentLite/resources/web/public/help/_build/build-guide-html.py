from pathlib import Path
import json, html, struct
HERE = Path(__file__).resolve().parent
OUT = HERE.parent
DATA = json.loads((HERE / 'guide-data.json').read_text(encoding='utf-8'))
def esc(value): return html.escape(str(value), quote=True)
def png_dimensions(path):
    with path.open('rb') as stream:
        header = stream.read(24)
    if len(header) != 24 or header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
        raise ValueError('Expected PNG screenshot: ' + str(path))
    width, height = struct.unpack('>II', header[16:24])
    if not width or not height:
        raise ValueError('Invalid PNG dimensions: ' + str(path))
    return width, height

def block(b):
    t = b['type']
    if t == 'subheading': return '<h3'+(' id="'+esc(b['id'])+'"' if b.get('id') else '')+'>'+esc(b['title'])+'</h3>'
    if t == 'paragraph': return '<p>' + esc(b['text']) + '</p>'
    if t == 'steps': return '<ol class="steps">' + ''.join('<li>'+esc(x)+'</li>' for x in b['items']) + '</ol>'
    if t == 'note': return '<aside class="note"><h3>'+esc(b['title'])+'</h3><p>'+esc(b['text'])+'</p></aside>'
    if t == 'code': return '<pre>'+esc(b['text'])+'</pre>'
    if t == 'table': return '<div class="table-wrap"><table><thead><tr>'+''.join('<th scope="col">'+esc(x)+'</th>' for x in b['headers'])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(x)+'</td>' for x in row)+'</tr>' for row in b['rows'])+'</tbody></table></div>'
    if t == 'links': return '<ul class="source-links">'+''.join('<li><a href="'+esc(url)+'"'+(' target="_blank" rel="noopener"' if url.startswith('http') else '')+'>'+esc(label)+'</a></li>' for label,url in b['items'])+'</ul>'
    if t == 'image':
        image=OUT / 'images' / b['file']
        if image.exists():
            width, height = png_dimensions(image)
            inner='<img src="images/'+esc(b['file'])+'" width="'+str(width)+'" height="'+str(height)+'" alt="'+esc(b['caption'])+'" loading="lazy">'
        else:
            inner='<div class="pending-shot">Иллюстрация появится после проверки интерфейса.</div>'
        return '<figure class="shot">'+inner+'<figcaption>'+esc(b['caption'])+'</figcaption></figure>'
    raise ValueError(t)
chapters=''.join('<section class="chapter" id="'+esc(p['id'])+'"><span class="chapter-number">Шаг '+str(i)+'</span><h2>'+esc(p['title'])+'</h2><p class="intro">'+esc(p['intro'])+'</p>'+''.join(block(b) for b in p['blocks'])+'</section>' for i,p in enumerate(DATA['pages'],1))
toc='<ol>'+''.join('<li><a href="#'+esc(p['id'])+'">'+esc(p['title'])+'</a></li>' for p in DATA['pages'])+'</ol>'
source='<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Инструкция Engee Agent</title><link rel="stylesheet" href="guide.css"><script src="guide.js" defer></script></head><body><header class="bar"><a class="brand" href="/">Engee Agent</a><div class="actions"><a class="button" href="/">В приложение</a><button class="button primary" id="print-guide" type="button">Печать / PDF</button></div></header><main class="book"><section class="hero"><span class="eyebrow">Руководство пользователя</span><h1>'+esc(DATA['title'])+'<br>'+esc(DATA['subtitle'])+'</h1><p>От распаковки архива до работы с проектом: локальные и облачные модели, доступ к Engee, файлы, навыки и перенос на другой ПК.</p><p class="meta">Windows 10/11 x64 · '+esc(DATA['date'])+' · Скриншоты без личных данных</p></section><nav class="toc" aria-label="Содержание"><h2>Содержание</h2>'+toc+'</nav>'+chapters+'<footer class="footer"><p>Инструкция хранится вместе с приложением: resources/web/public/help/guide.html. Официальные ссылки проверены 8 октября 2026. Условия облачных тарифов и доступность моделей могут измениться.</p><p>Для восстановления доступа используйте свой аккаунт соответствующего сервиса. Не вставляйте ключи, пароли и токены в сообщения или навыки.</p></footer></main></body></html>'
(OUT / 'guide.html').write_text(source,encoding='utf-8')
print('HTML chapters:',len(DATA['pages']))
print('Screenshots:',sum((OUT/'images'/b['file']).exists() for p in DATA['pages'] for b in p['blocks'] if b['type']=='image'))
