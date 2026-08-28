# Google OAuth 公開前チェックリスト

コードだけでは変更できない管理画面設定です。公開前にすべて確認してください。

- Firebase Console > Authentication > Sign-in method で Google を有効化する。
- Authentication > Settings > Authorized domains に本番ドメインだけを登録する。
- Google Cloud Console > Google Auth Platform > Branding で、アプリ名、サポートメール、運営者メールを設定する。
- ホームページ、`https://本番ドメイン/privacy-policy.html`、`https://本番ドメイン/terms.html` を登録する。ログインなしで閲覧できることを確認する。
- Authorized domains に所有ドメインを登録し、同じプロジェクトの Owner / Editor アカウントで Search Console の所有権を確認する。
- Data Access で、実際に必要な `openid`、`email`、`profile` 以外のスコープがないことを確認する。
- Audience を確認する。一般公開なら External とし、開発中は Test users のみに制限する。
- 本番と開発・検証でFirebase / Google Cloudプロジェクトを分ける。
- Google Cloud API Credentials でAPIキーにWebサイト制限（本番オリジン）と必要なAPIだけの制限を設定する。
- `npm install -g firebase-tools`、`firebase login`、`firebase use <project-id>` の後、`firebase deploy --only database` でRulesを反映する。
- `.env.example`を基にホスティング環境へ `VITE_FIREBASE_*` を設定する。`.env`はコミットしない。
- プライバシーポリシー内の問い合わせ先を実在する連絡先に置き換える。
- 実際の本番URLでログイン、投票、ログアウト、データ削除をテストする。
