import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import {
  suggestGroups,
  type GroupedReference,
  type ProviderStatus,
  type Reference,
  type State,
} from './model';

export function Assistant({
  data,
  onData,
  focused,
  onFocus,
}: {
  data: State;
  onData: (s: State) => void;
  focused: boolean;
  onFocus: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const chatHeading = useRef<HTMLHeadingElement>(null);
  const collectionHeading = useRef<HTMLHeadingElement>(null);
  const [quiet, setQuiet] = useState(false);
  const [provider, setProvider] = useState<ProviderStatus>({
    configured: false,
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [link, setLink] = useState('');
  const [target, setTarget] = useState('');
  const [items, setItems] = useState<Reference[]>([]);
  const [plan, setPlan] = useState<{
    id: string;
    projectId: string;
    references: GroupedReference[];
  }>();
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const active = useRef<string | undefined>(undefined);
  const latestRequest = useRef<string | undefined>(undefined);
  const [thinking, setThinking] = useState(false);
  const [conversation, setConversation] = useState<
    { role: string; text: string }[]
  >([]);
  useEffect(() => {
    api
      .provider?.()
      .then(setProvider)
      .catch(() => setError('无法读取 AI 配置。'));
  }, []);
  useEffect(
    () => () => {
      if (active.current) void api.cancelChat(active.current);
    },
    [],
  );
  async function perform(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function receive(refs: Reference[]) {
    if (lock.current) return;
    // Validate outside React's updater so invalid drops cannot crash rendering.
    const validated = suggestGroups(refs);
    setOpen(true);
    setError('');
    setPlan(undefined);
    setNotice('已接收引用；未读取文件内容。每批最多保留 30 项。');
    setItems((current) =>
      suggestGroups([...current, ...validated]).map(({ label, value }) => ({
        label,
        value,
      })),
    );
  }
  function drop(e: React.DragEvent) {
    e.preventDefault();
    try {
      if (e.dataTransfer.files.length)
        receive(
          Array.from(e.dataTransfer.files).map((file) =>
            api.fileReference(file),
          ),
        );
      else {
        const values = (
          e.dataTransfer.getData('text/uri-list') ||
          e.dataTransfer.getData('text/plain')
        )
          .split(/\r?\n/)
          .filter((v) => v.trim() && !v.startsWith('#'));
        receive(
          values.map((value) => {
            const url = new URL(value.trim());
            if (!['http:', 'https:'].includes(url.protocol))
              throw new Error('只接受 HTTP(S) 链接。');
            return { label: url.hostname, value: url.href };
          }),
        );
      }
    } catch {
      setError(
        '无法接收此内容；请使用文件或 HTTP(S) 链接，名称不超过 200 字符、路径或链接不超过 2000 字符。',
      );
      setOpen(true);
    }
  }
  async function send() {
    if (active.current || !draft.trim()) return;
    const id = crypto.randomUUID();
    active.current = id;
    latestRequest.current = id;
    setNotice('');
    setThinking(true);
    setError('');
    const text = draft.trim();
    try {
      const reply = await api.chat(id, text);
      if (active.current === id) {
        setConversation((c) =>
          [
            ...c,
            { role: '你', text },
            { role: '施怀雅 · AI', text: reply },
          ].slice(-40),
        );
        setDraft('');
      }
    } catch (e) {
      if (active.current === id)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (active.current === id) {
        active.current = undefined;
        setThinking(false);
      }
    }
  }
  async function cancel() {
    const id = active.current;
    if (!id) return;
    // Invalidate immediately: a reply may arrive before cancellation IPC resolves.
    active.current = undefined;
    setThinking(false);
    setNotice('已停止接收答复，正在取消请求；输入已保留。');
    try {
      await api.cancelChat(id);
      if (latestRequest.current === id) setNotice('已取消请求，输入已保留。');
    } catch {
      if (latestRequest.current === id)
        setError('已停止接收答复，但无法确认取消；请求可能持续至超时。');
    }
  }
  const selected = target || data.projects[0]?.id || '';
  return (
    <section
      className={`assistant ${focused ? 'focused' : ''}`}
      aria-label="施怀雅助手"
      onDragOver={(e) => e.preventDefault()}
      onDrop={drop}
    >
      {!open && !focused ? (
        <button
          className="assistant-launch primary"
          onClick={() => setOpen(true)}
        >
          S/ 施怀雅 · 对话与收集
        </button>
      ) : (
        <div className="assistant-panel panel">
          <header>
            <div>
              <span className="eyebrow">SWIRE / DESKTOP ASSISTANT</span>
              <h2>
                施怀雅{' '}
                <small>
                  {' '}
                  /{' '}
                  {thinking
                    ? '正在等待 AI'
                    : saving
                      ? '正在保存'
                      : plan
                        ? '等待你确认'
                        : quiet
                          ? '安静模式'
                          : '待命'}
                </small>
              </h2>
            </div>
          </header>
          <p className="fine">
            原创 S/ 占位徽记 · 尚无正式角色立绘。
            {!api.desktop && '浏览器文件只保存名称标识，不含可用本地路径。'}
          </p>
          <div className="assistant-actions">
            <button
              disabled={saving}
              onClick={() =>
                void perform(async () => {
                  await api.windowMode(focused ? 'workspace' : 'companion');
                  onFocus(!focused);
                })
              }
            >
              {focused ? '展开工作台' : '桌面小窗'}
            </button>
            <button aria-pressed={quiet} onClick={() => setQuiet(!quiet)}>
              {quiet ? '退出安静' : '安静'}
            </button>
            <button
              onClick={() => {
                if (api.desktop) void perform(() => api.windowMode('hide'));
                else {
                  setOpen(false);
                  onFocus(false);
                }
              }}
            >
              隐藏{api.desktop ? '到任务栏' : '助手'}
            </button>
            {!focused && <button onClick={() => setOpen(false)}>收起</button>}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          <div className="assistant-actions" aria-label="助手快捷导航">
            <button
              onClick={() =>
                collectionHeading.current?.scrollIntoView({ block: 'start' })
              }
            >
              收集与整理
            </button>
            <button
              onClick={() =>
                chatHeading.current?.scrollIntoView({ block: 'start' })
              }
            >
              跳到对话
            </button>
          </div>
          <div className="assistant-scroll">
            <h3 ref={collectionHeading}>收集箱 · {items.length}/30</h3>
            <p>
              拖入文件或链接 → 本地规则建议 → 确认视觉归组。原文件不会移动。
            </p>
            <label>
              归组项目
              <select
                aria-label="归组项目"
                disabled={saving}
                value={selected}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setPlan(undefined);
                }}
              >
                {!data.projects.length && (
                  <option value="">请先在工作台创建项目</option>
                )}
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const url = new URL(link);
                  if (!['https:', 'http:'].includes(url.protocol))
                    throw new Error();
                  receive([{ label: url.hostname, value: url.href }]);
                  setLink('');
                } catch {
                  setError('请输入完整的 HTTP(S) 链接。');
                }
              }}
            >
              <label>
                收集链接
                <input
                  value={link}
                  disabled={saving}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://…"
                  maxLength={2000}
                />
              </label>
              <button disabled={saving || !link.trim()}>加入收集箱</button>
              <button
                type="button"
                disabled={!api.desktop || saving}
                onClick={() =>
                  void perform(async () => {
                    const refs = suggestGroups(await api.pickFiles());
                    if (refs.length) {
                      setItems((current) =>
                        suggestGroups([...current, ...refs]),
                      );
                      setPlan(undefined);
                    }
                  })
                }
              >
                选择文件
              </button>
            </form>
            <ul className="collection-list">
              {items.map((r, i) => (
                <li key={r.value}>
                  <span title={r.value}>{r.label}</span>
                  <button
                    disabled={saving}
                    aria-label={`移除 ${r.label}`}
                    onClick={() => {
                      setItems(items.filter((_, j) => i !== j));
                      setPlan(undefined);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              disabled={!items.length || !selected || saving}
              onClick={() => {
                setPlan({
                  id: crypto.randomUUID(),
                  projectId: selected,
                  references: suggestGroups(items),
                });
                setNotice('请核对项目和分组；确认前不会保存。');
              }}
            >
              预览整理方案
            </button>
            {plan && (
              <section aria-label="整理方案预览" className="collection-preview">
                <h3>
                  确认归入：
                  {data.projects.find((p) => p.id === plan.projectId)?.name}
                </h3>
                <p className="fine">
                  本地扩展名规则，不是 AI 判断。已存在的引用自动跳过。
                </p>
                {plan.references.map((r, i) => (
                  <label key={r.value}>
                    {r.label}
                    <input
                      aria-label={`分组 ${r.label}`}
                      maxLength={80}
                      disabled={saving}
                      value={r.group}
                      onChange={(e) =>
                        setPlan({
                          ...plan,
                          references: plan.references.map((v, j) =>
                            i === j ? { ...v, group: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  className="primary"
                  disabled={
                    saving || plan.references.some((r) => !r.group.trim())
                  }
                  onClick={() =>
                    void perform(async () => {
                      onData(
                        await api.collect(
                          plan.id,
                          plan.projectId,
                          plan.references,
                        ),
                      );
                      setPlan(undefined);
                      setItems([]);
                      setNotice('归组已保存，重复引用已跳过。可在下方撤销。');
                    })
                  }
                >
                  确认归组
                </button>
                <button disabled={saving} onClick={() => setPlan(undefined)}>
                  取消方案
                </button>
              </section>
            )}
            <h3>已保存分组</h3>
            {(data.collections ?? [])
              .filter((c) => c.projectId === selected)
              .map((c) => (
                <article className="collection-preview" key={c.id}>
                  {c.references.map((r) => (
                    <p key={r.value} title={r.value}>
                      <b>{r.group}</b> · {r.label}
                    </p>
                  ))}
                  <button
                    disabled={saving}
                    onClick={() =>
                      void perform(async () => {
                        onData(await api.uncollect(c.id));
                        setNotice('已撤销这批分组；原文件未改动。');
                      })
                    }
                  >
                    撤销这批归组
                  </button>
                </article>
              ))}
            <h3 ref={chatHeading}>AI 文字对话</h3>
            <p className="fine">
              {provider.configured
                ? `${provider.model} · ${provider.endpoint}`
                : 'AI 未配置。桌面设置页提供配置说明；浏览器预览不连接 AI。'}
            </p>
            {!quiet && (
              <p>把当前想解决的事写给我。收集箱和项目不会自动发送给 AI。</p>
            )}
            <div aria-live="polite">
              {conversation.map((m, i) => (
                <article className="message" key={i}>
                  <b>{m.role}</b>
                  <p>{m.text}</p>
                </article>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label>
                发给 AI 的文字
                <textarea
                  maxLength={4000}
                  value={draft}
                  disabled={thinking}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </label>
              <p className="fine">
                每次仅发送当前输入，不包含历史。对话保留在当前窗口内；不会读取附件或自动上传文件。
              </p>
              <button
                className="primary"
                disabled={!provider.configured || thinking || !draft.trim()}
              >
                发送给 AI
              </button>
              {thinking && (
                <button type="button" onClick={() => void cancel()}>
                  取消请求
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
