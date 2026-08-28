import React from 'react';

const sections = {
  privacy: {
    title: 'プライバシーポリシー',
    content: (
      <>
        <p>本サイトは、試合予想への投票機能を提供するため、Googleを利用したFirebase Authenticationを使用します。</p>
        <h3>取得・保存する情報</h3>
        <p>Googleログイン時に提供される利用者識別子（UID）、表示名および認証に必要な基本情報を取り扱います。本サイトのデータベースには、UIDと試合ごとの投票内容を保存します。Googleアカウントのパスワードは取得しません。</p>
        <h3>利用目的</h3>
        <p>本人識別、重複投票の防止、投票履歴・的中率の表示、不正利用の防止にのみ利用します。</p>
        <h3>外部サービス・第三者提供</h3>
        <p>認証とデータ保存にGoogle Firebaseを利用します。法令に基づく場合を除き、取得情報を広告目的で販売したり、第三者へ提供したりしません。</p>
        <h3>保存期間と削除</h3>
        <p>情報は機能提供に必要な期間保存します。ログイン後の「アカウントと投票データを削除」から、保存された投票と本サイトの認証アカウントを削除できます。</p>
        <h3>問い合わせ</h3>
        <p>運営者は、公開前にここへ連絡可能なメールアドレスを記載してください。</p>
        <p><small>制定日: 2026年8月29日</small></p>
      </>
    ),
  },
  terms: {
    title: '利用規約',
    content: (
      <>
        <p>本サイトは、サッカーの試合データ分析および予想投票を試験的に提供するサービスです。</p>
        <h3>免責事項</h3>
        <p>掲載する分析・予想・試合情報の正確性や完全性を保証しません。これらは参考情報であり、賭博、投資その他の判断を推奨するものではありません。利用により生じた損害について、運営者は法令上認められる範囲で責任を負いません。</p>
        <h3>禁止事項</h3>
        <p>不正アクセス、自動化された大量投票、他者へのなりすまし、サービス運営を妨害する行為を禁止します。</p>
        <h3>サービスの変更</h3>
        <p>運営者は、必要に応じて本サービスまたは本規約を変更・停止できます。重要な変更は本サイト上で告知します。</p>
        <p><small>制定日: 2026年8月29日</small></p>
      </>
    ),
  },
};

export default function LegalModal({ type, onClose }) {
  if (!type || !sections[type]) return null;
  const section = sections[type];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="legal-title" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.72)', display: 'grid', placeItems: 'center', padding: '20px' }}>
      <article onClick={(event) => event.stopPropagation()} style={{ width: 'min(720px, 100%)', maxHeight: '85vh', overflowY: 'auto', background: '#172033', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '12px', padding: '24px', lineHeight: 1.75 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'start' }}>
          <h2 id="legal-title" style={{ marginTop: 0 }}>{section.title}</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" style={{ background: '#334155', color: '#fff', border: 0, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer' }}>閉じる</button>
        </div>
        {section.content}
      </article>
    </div>
  );
}
