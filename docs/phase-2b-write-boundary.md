# Phase 2B write境界

Admin Server ActionはPhase 2Aのsession、origin、write flagを検証する。
confirmおよびpreview破棄は、さらにtransaction内でsingleton content stateを
FOR UPDATEで取得し、contentModeがadminの場合だけ処理する。
bootstrapではproposal（rejected/supersededを含む）、revision、contentを作成しない。
idempotency再送にも同じ境界を適用する。previewはbootstrapでも検証・表示できるが、
confirmの許可を保証しない。

activationやlegacy import lockを変更するアプリケーション機能は含まない。
今回の境界修正には追加migrationは不要。0008は既存Phase 2Bのadditive migration。

## Production rollout: write-disabled Server Action契約

`ADMIN_WRITE_ENABLED=false`では、write UI route（new / edit / link）は404を維持する。
ただしServer ActionはPOSTされた現在のpage routeで実行されるため、HTTP 404を
契約にしない。write flag拒否はHTTP 200のRSC responseでもよく、次をすべて満たす
fail-closed error stateであることを必須とする。

- Action returnが`stage: "error"`であり、approved / rejected / supersededなどの成功結果ではない
- proposal、revision、appearance、source、seriesのmutationを一切作成しない
- `content_management_state`を変更しない
- revalidation、redirect、Set-Cookieなどの副作用を行わない
- POST responseに`no-store`があり、`public`、`s-maxage`、cacheableな`max-age`、`immutable`、`stale-*`がない
- authorization / configurationの詳細、secret、internal errorをreturn payloadへ含めない

write-disabled Actionが成功結果を返す、DB/content stateを変更する、revalidation・redirect
などの副作用を起こす、または上記cache / response制約を満たさない場合は停止条件とする。
Productionではfingerprintの前後比較でDB不変を確認し、write flagをtrueへ変更してこの
契約を確認してはならない。

## Integration test

ephemeral Neon branchだけでcontentModeをadminにするfixtureを使用する。
activation日時・legacy lock日時は変更せず、finallyで元のmodeへ戻す。
bootstrap拒否前後はcontent、source、proposal、revision、stateの全行fingerprintを比較する。
adminでpreviewした後にbootstrapへ変更するtransactionとconfirmを並行実行し、
confirmがstate行lockを待って変更後のmodeを検証することを確認する。
既存mutation、stale version、idempotency、rollbackテストはadmin fixture内で実行する。

## Production相当Preview rehearsal

正式なactivation実装前はcontentMode=bootstrapを維持する。
実施可能なのはmigration互換性、公開表示、read-only Admin、認証・origin・cache、
write flag無効時の拒否、write flag有効時のpreviewとconfirm拒否、
拒否後のDB無変更およびlegacy import dry-runである。

成功confirmのブラウザーE2E、成功mutation後のpublic revalidation、
成功confirm再送、複数画面からのstale競合E2Eは正式activation実装後まで保留する。
integration用mode fixtureをPreview rehearsalやProductionへ流用しない。
