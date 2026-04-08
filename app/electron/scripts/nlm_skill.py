#!/usr/bin/env python3
"""
Tidy NotebookLM skill runner.
Usage: python nlm_skill.py <skill_id> <output_dir>
Input JSON via stdin: {"content": "...", "language": "ko", "title": "..."}
Outputs JSON lines to stdout for progress tracking.
"""
import asyncio
import sys
import json
import os

SKILL_CONFIG = {
    # timeout: wait_for_completion 타임아웃 (초)
    # source_timeout: add_text wait_timeout (초)
    'nlm-slides':      {'generate': 'slide_deck',  'download': 'slide_deck',  'ext': 'pptx', 'label': '슬라이드 덱',  'timeout': 600,  'source_timeout': 180},
    'nlm-audio':       {'generate': 'audio',        'download': 'audio',       'ext': 'mp3',  'label': '오디오 요약',  'timeout': 1200, 'source_timeout': 180},
    'nlm-video':       {'generate': 'video',        'download': 'video',       'ext': 'mp4',  'label': '영상 요약',    'timeout': 1800, 'source_timeout': 180},
    'nlm-infographic': {'generate': 'infographic',  'download': 'infographic', 'ext': 'png',  'label': '인포그래픽',   'timeout': 600,  'source_timeout': 180},
    'nlm-quiz':        {'generate': 'quiz',         'download': 'quiz',        'ext': 'md',   'label': '퀴즈',         'timeout': 300,  'source_timeout': 120, 'dl_kwargs': {'output_format': 'markdown'}},
    'nlm-flashcards':  {'generate': 'flashcards',   'download': 'flashcards',  'ext': 'md',   'label': '플래시카드',   'timeout': 300,  'source_timeout': 120, 'dl_kwargs': {'output_format': 'markdown'}},
    'nlm-datatable':   {'generate': 'data_table',   'download': 'data_table',  'ext': 'csv',  'label': '데이터 표',    'timeout': 300,  'source_timeout': 120},
    'nlm-report':      {'generate': 'report',       'download': 'report',      'ext': 'md',   'label': '브리핑 문서',  'timeout': 300,  'source_timeout': 120},
    'nlm-mindmap':     {'generate': 'mind_map',     'download': 'mind_map',    'ext': 'html', 'label': '마인드맵',     'timeout': 300,  'source_timeout': 120, 'no_wait': True, 'post': 'mindmap_to_html'},
}

def log(data):
    print(json.dumps(data, ensure_ascii=False), flush=True)


def mindmap_to_html(json_path, html_path):
    """NotebookLM 마인드맵 JSON → 브라우저용 HTML 시각화 변환"""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 루트 노드 추출 (구조 유연하게 처리)
    root = data
    if isinstance(data, dict):
        root = data.get('root') or data.get('mind_map') or data.get('nodes') or data

    def to_html_tree(node, depth=1):
        if isinstance(node, str):
            return f'<div class="node d{min(depth,5)}"><span>{node}</span></div>'
        if not isinstance(node, dict):
            return ''
        text = node.get('text') or node.get('title') or node.get('name') or node.get('label') or ''
        children = node.get('children') or node.get('nodes') or node.get('items') or []
        child_html = ''.join(to_html_tree(c, depth + 1) for c in children)
        children_div = f'<div class="children">{child_html}</div>' if child_html else ''
        toggle = ' data-toggle="true"' if children else ''
        return f'<div class="node d{min(depth,5)}"{toggle}><span>{text}</span>{children_div}</div>'

    tree_html = to_html_tree(root if isinstance(root, dict) else {'children': root})

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>마인드맵</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #0d0e16; color: #e0e0f0; font-family: -apple-system, "Helvetica Neue", sans-serif; padding: 32px 24px; min-height: 100vh; }}
  h1 {{ font-size: 13px; font-weight: 500; color: #3a3c58; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 28px; }}
  .node {{ position: relative; padding: 4px 0; }}
  .node > span {{
    display: inline-block; padding: 5px 14px; border-radius: 20px;
    font-size: 13px; line-height: 1.4; cursor: default;
    transition: opacity 0.15s;
  }}
  .node[data-toggle] > span {{ cursor: pointer; }}
  .node[data-toggle] > span:hover {{ opacity: 0.8; }}
  .d1 > span {{ background: #4285f4; color: #fff; font-size: 16px; font-weight: 700; padding: 8px 20px; border-radius: 24px; }}
  .d2 > span {{ background: #1a237e; color: #9ab4f8; border: 1px solid #3949ab; }}
  .d3 > span {{ background: #1b2a1b; color: #81c784; border: 1px solid #2e7d32; }}
  .d4 > span {{ background: #1a1a2e; color: #ce93d8; border: 1px solid #6a1b9a; font-size: 12px; }}
  .d5 > span {{ background: #1a1c28; color: #8082a0; border: 1px solid #2a2c40; font-size: 11px; }}
  .children {{
    margin-left: 28px;
    padding-left: 16px;
    border-left: 1px solid #1e2030;
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }}
  .collapsed > .children {{ display: none; }}
  .node[data-toggle] > span::before {{ content: "▾ "; font-size: 10px; opacity: 0.5; }}
  .collapsed[data-toggle] > span::before {{ content: "▸ "; }}
</style>
</head>
<body>
<h1>NotebookLM · 마인드맵</h1>
{tree_html}
<script>
  document.querySelectorAll('[data-toggle]').forEach(el => {{
    el.querySelector(':scope > span').addEventListener('click', () => {{
      el.classList.toggle('collapsed');
    }});
  }});
</script>
</body>
</html>"""

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)


async def main():
    if len(sys.argv) < 3:
        log({'error': 'Usage: nlm_skill.py <skill_id> <output_dir>'})
        sys.exit(1)

    skill_id = sys.argv[1]
    output_dir = sys.argv[2]

    try:
        raw = sys.stdin.read()
        inp = json.loads(raw) if raw.strip() else {}
    except Exception:
        inp = {}

    content = inp.get('content', '')
    language = inp.get('language', 'ko')
    title = inp.get('title', 'Tidy Input')

    cfg = SKILL_CONFIG.get(skill_id)
    if not cfg:
        log({'error': f'지원하지 않는 스킬: {skill_id}'})
        sys.exit(1)

    try:
        from notebooklm import NotebookLMClient
    except ImportError:
        log({'error': 'notebooklm-py 미설치', 'setup_required': True, 'step': 'install'})
        sys.exit(1)

    try:
        log({'progress': '노트북 생성 중...', 'step': 1, 'total': 5})

        async with await NotebookLMClient.from_storage() as client:
            nb = await client.notebooks.create(title=f'tidy-{skill_id}')
            nb_id = nb.id if hasattr(nb, 'id') else nb['id']

            try:
                source_timeout = cfg.get('source_timeout', 180)
                completion_timeout = cfg.get('timeout', 600)

                log({'progress': '콘텐츠 업로드 중...', 'step': 2, 'total': 5})
                await client.sources.add_text(
                    nb_id, title=title, content=content,
                    wait=True, wait_timeout=source_timeout
                )

                log({'progress': f'{cfg["label"]} 생성 중... (시간이 걸릴 수 있습니다)', 'step': 3, 'total': 5})
                gen_fn = getattr(client.artifacts, f'generate_{cfg["generate"]}')

                if cfg.get('no_wait'):
                    # mind_map은 결과 직접 반환, wait 불필요
                    await gen_fn(nb_id)
                else:
                    status = await gen_fn(nb_id, language=language)
                    task_id = status.task_id if hasattr(status, 'task_id') else status['task_id']

                    log({'progress': f'생성 완료 대기 중... (최대 {completion_timeout//60}분)', 'step': 4, 'total': 5})
                    await client.artifacts.wait_for_completion(nb_id, task_id, timeout=completion_timeout)

                log({'progress': '파일 다운로드 중...', 'step': 5, 'total': 5})

                os.makedirs(output_dir, exist_ok=True)
                out_path = os.path.join(output_dir, f'tidy-{skill_id}.{cfg["ext"]}')

                # 마인드맵은 JSON으로 먼저 받은 뒤 HTML로 변환
                if cfg.get('post') == 'mindmap_to_html':
                    json_path = out_path.replace('.html', '.json')
                    dl_fn = getattr(client.artifacts, f'download_{cfg["download"]}')
                    await dl_fn(nb_id, json_path)
                    mindmap_to_html(json_path, out_path)
                    os.remove(json_path)  # 원본 JSON 삭제
                else:
                    dl_fn = getattr(client.artifacts, f'download_{cfg["download"]}')
                    dl_kwargs = cfg.get('dl_kwargs', {})
                    await dl_fn(nb_id, out_path, **dl_kwargs)

                log({'done': True, 'path': out_path, 'ext': cfg['ext'], 'label': cfg['label']})

            finally:
                try:
                    await client.notebooks.delete(nb_id)
                except Exception:
                    pass

    except FileNotFoundError:
        log({'error': 'notebooklm login을 먼저 실행해주세요.', 'setup_required': True, 'step': 'login'})
        sys.exit(1)
    except Exception as e:
        log({'error': str(e)})
        sys.exit(1)

asyncio.run(main())
