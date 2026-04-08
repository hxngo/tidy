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
    """NotebookLM 마인드맵 JSON → D3.js 라디얼 트리 시각화"""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    data_str = json.dumps(data, ensure_ascii=False)

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>마인드맵</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{
    background: #0f1018;
    width: 100vw; height: 100vh;
    overflow: hidden;
    font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
  }}
  svg {{ width:100%; height:100%; }}
  .link {{
    fill: none;
    stroke-width: 1.5;
    stroke-opacity: 0.35;
  }}
  .node circle {{
    cursor: pointer;
    transition: all 0.2s ease;
  }}
  .node circle:hover {{ stroke-opacity: 1 !important; stroke-width: 2.5 !important; }}
  .node text {{
    pointer-events: none;
    font-size: 11.5px;
    fill: #d0d2e8;
    letter-spacing: -0.01em;
  }}
  .node.root text {{
    font-size: 14px;
    font-weight: 700;
    fill: #ffffff;
  }}
  .hint {{
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    color: #2a2c40;
    letter-spacing: 0.05em;
    pointer-events: none;
  }}
</style>
</head>
<body>
<svg id="svg"></svg>
<div class="hint">스크롤: 확대/축소 · 드래그: 이동 · 노드 클릭: 접기/펼치기</div>
<script>
const RAW = {data_str};

const BRANCH_COLORS = [
  '#4285f4','#ea4335','#fbbc04','#34a853',
  '#ff6d00','#ab47bc','#00bcd4','#e91e63',
  '#8bc34a','#ff7043','#26c6da','#7e57c2',
];

// 다양한 JSON 구조 정규화
function normalize(node) {{
  if (!node || typeof node !== 'object') return {{ name: String(node || ''), children: [] }};
  const name = (node.text || node.title || node.name || node.label || '').trim();
  const rawKids = node.children || node.nodes || node.items || [];
  return {{ name, children: Array.isArray(rawKids) ? rawKids.map(normalize).filter(n => n.name) : [] }};
}}

const rawRoot = RAW.root || RAW.mind_map || RAW;
const treeData = normalize(Array.isArray(rawRoot) ? {{ children: rawRoot }} : rawRoot);

const W = window.innerWidth, H = window.innerHeight;
const R = Math.min(W, H) * 0.42;

const svg = d3.select('#svg').attr('viewBox', [-W/2, -H/2, W, H]);
const g = svg.append('g');

svg.call(d3.zoom().scaleExtent([0.15, 5])
  .on('zoom', e => g.attr('transform', e.transform)));

function radialPt(x, y) {{
  return [(+y) * Math.cos(x - Math.PI/2), (+y) * Math.sin(x - Math.PI/2)];
}}

function draw(data) {{
  g.selectAll('*').remove();

  const hier = d3.hierarchy(data);
  d3.tree().size([2 * Math.PI, R])
    .separation((a,b) => (a.parent===b.parent ? 1 : 2.2) / a.depth)(hier);

  // 브랜치별 색상 배정
  (hier.children || []).forEach((child, i) => {{
    const c = BRANCH_COLORS[i % BRANCH_COLORS.length];
    child.each(d => d.color = c);
  }});
  hier.color = '#ffffff';

  // 링크
  g.append('g').selectAll('path')
    .data(hier.links())
    .join('path')
    .attr('class', 'link')
    .attr('stroke', d => d.target.color || '#4285f4')
    .attr('d', d3.linkRadial().angle(d => d.x).radius(d => d.y));

  // 노드
  const node = g.append('g').selectAll('g')
    .data(hier.descendants())
    .join('g')
    .attr('class', d => 'node' + (d.depth===0 ? ' root' : ''))
    .attr('transform', d => `translate(${{radialPt(d.x, d.y)}})`)
    .on('click', (e, d) => {{
      e.stopPropagation();
      if (d.depth === 0) return;
      if (d.children) {{ d._children = d.children; d.children = null; }}
      else if (d._children) {{ d.children = d._children; d._children = null; }}
      draw(data);
    }});

  const rScale = d => d.depth===0 ? 30 : d.depth===1 ? 12 : d.depth===2 ? 7 : 5;

  // 원형 노드
  node.append('circle')
    .attr('r', rScale)
    .attr('fill', d => d.depth===0 ? '#1a1c2e'
      : d.depth===1 ? (d.color+'33')
      : (d.color+'1a'))
    .attr('stroke', d => d.color || '#4285f4')
    .attr('stroke-width', d => d.depth<=1 ? 2 : 1.5)
    .attr('stroke-opacity', d => d.depth===0 ? 0.8 : 0.7);

  // 텍스트
  node.append('text')
    .attr('transform', d => {{
      if (d.depth===0) return '';
      const deg = d.x * 180/Math.PI - 90;
      const flip = d.x >= Math.PI;
      return `rotate(${{flip ? deg+180 : deg}})`;
    }})
    .attr('x', d => {{
      if (d.depth===0) return 0;
      const right = d.x < Math.PI;
      return (right ? 1 : -1) * (rScale(d) + 6);
    }})
    .attr('text-anchor', d => {{
      if (d.depth===0) return 'middle';
      return d.x < Math.PI ? 'start' : 'end';
    }})
    .attr('dy', '0.35em')
    .style('font-size', d => d.depth===0 ? '14px' : d.depth===1 ? '12px' : '11px')
    .style('font-weight', d => d.depth<=1 ? '600' : '400')
    .style('fill', d => d.depth===0 ? '#fff' : d.depth===1 ? (d.color||'#e0e0f0') : '#c0c2d8')
    .text(d => d.data.name.length > 28 ? d.data.name.slice(0,27)+'…' : d.data.name);
}}

draw(treeData);
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
