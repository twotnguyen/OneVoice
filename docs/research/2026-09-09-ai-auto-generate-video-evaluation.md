# Đánh giá `huytranvan2010/AI-auto-generate-video` cho OneVoice

> Ngày đánh giá: 09/09/2026 (UTC+07)  
> Bản đã kiểm: local clone `references/AI-auto-generate-video` tại commit `15c0103bd127e9a2ed963e81cdc33b04b17482cc` (05/09/2026). Remote `origin` trỏ đúng `https://github.com/huytranvan2010/AI-auto-generate-video.git`.  
> Phạm vi: đánh giá repo nguồn như một **tham khảo P1 media/video**, không phải xác nhận đã tích hợp vào OneVoice.

## Kết luận

**Quyết định: REFERENCE + tái triển khai có chọn lọc bên trong `MediaProvider` adapter P1; không clone/fork/nhúng repo, không thêm HyperFrames hay OmniVoice vào baseline hiện tại.**

Repo có một ý tưởng đáng dùng: tách AI viết kịch bản khỏi pipeline render quyết định được; Zod validate script, TTS từng scene, render template HTML, FFmpeg chuẩn hoá/ghép/mux thành MP4. Điều này khớp với định hướng OneVoice chỉ cho AI tạo draft có cấu trúc còn side effect/media do worker xử lý. Tuy nhiên nó là CLI làm video tin ngắn độc lập, không có `ContentPassport`, evidence/Truth Guard, RBAC, job/outbox, artifact storage hay retry/idempotency cấp nghiệp vụ. Nó cũng chọn HyperFrames và OmniVoice, trong khi OneVoice đã chốt Revideo là renderer P1 và VieNeu-TTS chỉ được thử nghiệm qua adapter.

Không copy nguyên mã hoặc template vào sản phẩm. Nếu sau P0 cần video, dùng nó như reference implementation cho: contract storyboard, pipeline per-scene, đo thời lượng bằng `ffprobe`, chuẩn hoá clip trước concat và lưu artifact theo hash. Những phần này phải được viết lại/kiểm thử trong ranh giới adapter của OneVoice.

## Bằng chứng nguồn và tính thời điểm

- GitHub hiển thị repo công khai, `main`, 7 commits, không có release; thông tin này là ảnh chụp ngày đánh giá, không phải cam kết maturity lâu dài. [Repository page](https://github.com/huytranvan2010/AI-auto-generate-video)
- SHA nêu trên là HEAD của local clone và trùng revision đã dùng cho mọi link mã dưới đây. Các khẳng định về code không dựa vào nhánh `main` trôi.
- Verification local lúc 12:00 UTC+07: `npm ci --ignore-scripts`, `npm test`, `npm run typecheck` đều hoàn tất; Vitest báo **5 files / 23 tests pass**; `npm ci` báo **9 vulnerabilities** (1 low, 3 moderate, 5 high) theo database cục bộ tại thời điểm cài. Đây chỉ là signal dependency, không phải security audit/release approval.

## Repo thực sự làm gì

Luồng đầu vào là URL hoặc `.txt` (qua skill của coding agent) thành `script.json`; CLI validate schema, phát TTS cho từng scene, ghép voice/SFX, render mỗi HTML template bằng HyperFrames/Chromium, fit clip theo thời lượng lời đọc, rồi dùng FFmpeg concat và mux thành MP4 1080×1920. README mô tả chính xác tám bước và artifact `video.mp4`, `voice.mp3`, `script.txt`. [README tại SHA đã kiểm](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/README.md)

| Lớp | Cách repo hiện thực | Ý nghĩa với OneVoice |
|---|---|---|
| Runtime | Node >=22, TypeScript ESM; CLI `tsx src/cli.ts`; package không cung cấp service/API/Compose. [package.json](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/package.json) | Không thể gọi từ Next.js request; nếu dùng phải nằm trong worker job. |
| Input contract | `TemplateScriptSchema`: 3–12 scene, scene đầu `hook`, scene cuối `outro`, `voiceText`, `templateId`, template `inputs` để mở. [schema](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-script-schema.ts) | Hình mẫu tốt cho *storyboard*, nhưng thiếu product/offer version, evidence refs, template revision và artifact provenance bắt buộc của OneVoice. |
| TTS | Chỉ chấp nhận `TTS_PROVIDER=omnivoice`; HTTP `POST {endpoint}/tts` với `{text}`, nhận `audio/mpeg`, timeout 60s và tối đa 4 attempts. [config](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/config.ts), [client](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/tts/omnivoice-client.ts) | Không khớp `TtsProvider` của OneVoice và không được dùng để thay quyết định VieNeu-TTS/voice consent. |
| Render | Mỗi template vendored được gọi qua `npx hyperframes@0.6.94 render`; renderer khởi Chromium. [composer](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-composer.ts) | Là runtime mới ngoài stack đã chốt; `npx` tại render time có network/supply-chain drift, không đạt offline rehearsal nếu chưa đóng gói/pin artifact. |
| Media | FFmpeg `libx264`, `libmp3lame`, AAC để fit, concat và mux; `ffprobe` đo duration. [video tools](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/video-tools.ts), [audio tools](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/assets/audio-tools.ts) | Các pattern kỹ thuật có ích, nhưng `libx264`/`libmp3lame` là chi tiết build cần đối chiếu với `ffmpeg -buildconf` và chính sách codec của OneVoice trước khi shipping. |
| Assets/templates | 11 template HTML 16:9/9:16; template nối Google Fonts trực tiếp. Một số `NOTICE.md` nói template được vendored/adapt từ `nexu-io/html-video`, phần khác tự nhận original. [catalog](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/templates/CATALOG.md), [ví dụ NOTICE](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/templates/frame-bold-poster/NOTICE.md) | Không bundle/default-use trước khi tạo inventory riêng cho từng template, font và asset, hoặc thay bằng template do OneVoice sở hữu. |

## Đối chiếu với contract OneVoice

OneVoice là modular monolith: worker chỉ xử lý render/publish/retry, DB là SSOT và provider nằm sau adapter. [Architecture §1](../development/architecture-and-tech-stack.md#1-quyết-định-kiến-trúc-ở-mức-cao), [§2](../development/architecture-and-tech-stack.md#2-ranh-giới-module-trong-modular-monolith)  Blueprint đặt video + Revideo + subtitle + TTS ở P1, sau P0. [Blueprint §5.2](../development/onevoice-project-blueprint.md#52-p1--sau-khi-p0-ổn-định)

| Yêu cầu OneVoice | Repo đáp ứng | Khoảng cách quyết định |
|---|---|---|
| Render chỉ từ facts/snapshot đã chọn; claims có evidence; Passport có source/template/model/output hash | Chỉ có `metadata.source` URL/domain/image và text/slot tự do; pipeline không biết catalog, facts hay claims. [schema](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-script-schema.ts) | OneVoice phải sinh storyboard từ `Content` đã validate, lưu `sourceSnapshotHash`, evidence/version, template revision, TTS/model revision, render config và SHA-256 artifact trong Passport. Không cho coding-agent đọc URL rồi tự tạo fact marketing. |
| Approval/RBAC/Truth Guard chặn stale trước publish | Không có state machine, approval, auth hay kiểm facts hiện hành. | Không để render successful đồng nghĩa `PUBLISHED`; render result chỉ là `ContentArtifact`. Publish phải đi qua content state, Truth Guard và ChannelAdapter hiện hữu. |
| Worker, outbox, retry và idempotency ở business boundary | TTS retry cục bộ; re-use file nếu path đã tồn tại, nhưng không có job id/key, DB receipt hay trạng thái visible. [pipeline](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-pipeline.ts) | Job OneVoice cần key tối thiểu `(contentId, revision, templateHash, rendererVersion)`; persist attempt/status/correlation ID qua outbox, và không lấy file-exists làm idempotency authority. |
| P0 offline, media/TTS không chặn demo; P1 renderer được chọn là Revideo | Cần Node, Chrome/Chromium, FFmpeg/ffprobe, server OmniVoice; HyperFrames gọi `npx` để tải/chạy package. [README prerequisites](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/README.md), [composer](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-composer.ts) | Giữ pre-rendered/text-only fallback. Không thêm renderer thứ hai cạnh Revideo cho P1 nếu chưa có ADR thay đổi quyết định. |
| Mã OneVoice Apache-2.0; media/model/font/binary cần inventory riêng | App code của repo là MIT, nhưng có template provenance hỗn hợp, Google-hosted fonts và SFX tải động. [LICENSE](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/LICENSE), [SFX downloader](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/scripts/download-sfx.ts) | MIT code có thể tương thích khi copy có notice, nhưng không chứng minh quyền cho downstream assets/voices/fonts. OneVoice phải review từng item; không kế thừa blanket license. |

Các yêu cầu trên không phải tuỳ chọn: tool matrix nói mọi LLM/TTS/media đi qua adapter, P0 không bị chặn bởi render/TTS, Revideo/VieNeu/FFmpeg là sau P0 hoặc có điều kiện, và release phải có NOTICE/inventory/provenance. [Tools matrix](../development/tools-and-repositories.md#2-ma-trận-quyết-định), [baseline](../development/tools-and-repositories.md#3-baseline-được-phép-implement-trước), [release conditions](../development/tools-and-repositories.md#5-điều-kiện-công-khai-repository)

## License, provenance và rủi ro asset

### Code license

`LICENSE` của repo là MIT, copyright `AI Coding` và `Ho Quang Hai`. Đây là giấy phép permissive, nhưng khi sao chép phần code đáng kể phải giữ copyright/license MIT trong NOTICE/dependency inventory; không được dán nhãn code bên thứ ba là Apache-2.0. [MIT LICENSE tại SHA](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/LICENSE)

### Provenance chưa đủ để adoption trực tiếp

1. Các `NOTICE.md` mô tả một số template là vendored/adapted từ `nexu-io/html-video` (Apache-2.0) và có design lineage MIT. Đây là self-declared attribution hữu ích, không thay thế việc pin upstream SHA và xác minh exact file/license trước khi copy. Ví dụ: [frame-bold-poster NOTICE](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/templates/frame-bold-poster/NOTICE.md), [frame-logo-outro NOTICE](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/templates/frame-logo-outro/NOTICE.md).
2. Template liên kết `fonts.googleapis.com` thay vì bundle/pin font files. Rehearsal offline sẽ phụ thuộc cache/font fallback và việc render có thể khác; license/font source phải inventory riêng. Ví dụ: [portrait template](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/templates/frame-bold-poster/compositions/portrait.html).
3. Script tải SFX scrape kết quả tìm kiếm từ `myinstants.com`, không lưu source URL/license/per-file provenance cùng asset. Đây là **không phù hợp release/demo public** cho tới khi thay bằng thư viện âm thanh có quyền rõ, lock manifest (URL, license, hash, attribution) hoặc tắt hẳn SFX. [downloader](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/scripts/download-sfx.ts)
4. Repo dùng OmniVoice như TTS duy nhất. License của application repo không cấp quyền cho model weights, voice hoặc output. OneVoice đã ghi rõ chọn thử nghiệm VieNeu-TTS qua adapter và yêu cầu pin revision/consent. [tool decision](../development/tools-and-repositories.md#2-ma-trận-quyết-định)
5. FFmpeg commands yêu cầu `libx264` và `libmp3lame`; không thể suy diễn build license chỉ từ lệnh. Cần lưu `ffmpeg -version` và `ffmpeg -buildconf` của image thực tế, đúng như policy OneVoice.

## Chất lượng và mức hoàn thiện

**Điểm mạnh có bằng chứng**

- Contract script có Zod; TTS theo scene có retry; output partial có thể re-use theo file; concat/mux dùng `spawn` với mảng argument thay vì shell string trong FFmpeg helper. [pipeline](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-pipeline.ts), [video tools](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/video-tools.ts)
- Local verification đã chạy qua các test cho config, slug, image fetch, chọn SFX và một phần audio; 23 test pass/typecheck pass. Đó là coverage component, không phải E2E render.
- README, catalog và `NOTICE.md` khá rõ về mục đích template và các asset được vendored.

**Giới hạn/rủi ro cần sửa nếu lấy ý tưởng**

- Không có test end-to-end nào render thật qua Chromium + HyperFrames + TTS + FFmpeg; không có CI workflow/Compose/release; hiện chỉ 7 commits và không có release. [repository page](https://github.com/huytranvan2010/AI-auto-generate-video)
- Schema giữ `inputs` kiểu `Record<string, unknown>` và không validate slot theo từng template dù comment nói template tự validate; `composeTemplate` chỉ inject JSON rồi spawn renderer. Sai copy/layout/fact có thể đi tới artifact mà không bị domain guard phát hiện. [schema](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-script-schema.ts), [composer](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-composer.ts)
- Có mismatch đường dẫn SFX: downloader mặc định ghi `${PROJECT_ROOT}/SFX`, `.gitignore` cũng bỏ qua `SFX/`, trong khi pipeline tìm từ script output đến `assets/sfx`. Vì vậy lần tải mặc định có thể không được pipeline index. Không ảnh hưởng render không SFX, nhưng là dấu hiệu chưa có E2E coverage. [downloader](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/scripts/download-sfx.ts), [pipeline lines 83–105](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-pipeline.ts#L83-L105), [.gitignore](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/.gitignore)
- `npx hyperframes@0.6.94` pins a package version but executes it at runtime; template `hyperframes.json` registry points to a moving `main` raw GitHub URL. It is not a fully locked, air-gapped renderer supply chain. [composer](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/src/render/template-composer.ts), [example config](https://github.com/huytranvan2010/AI-auto-generate-video/blob/15c0103bd127e9a2ed963e81cdc33b04b17482cc/templates/frame-liquid-bg-hero/hyperframes.json)
- It retries TTS only. Render/FFmpeg failure has no persisted job status, no dead letter, no resource quota/cancellation, and no cleanup of template-composer temporary variable directory.
- The agent skill fetches arbitrary article URLs and writes its own facts/script. That is useful for a creator workflow but conflicts with OneVoice, where content generation must receive controlled snapshot ID and evidence-backed claims.

## Quyết định theo phần

| Thành phần repo | Quyết định | Điều kiện áp dụng |
|---|---|---|
| Tách `script/storyboard` khỏi renderer deterministic | **Adopt pattern, tự viết** | Storyboard phải được sinh từ `Content` snapshot/claims đã validate, với schema per-template và hash canonical. |
| Fit clip theo duration, re-encode trước concat, mux audio/video | **Reference, tự viết/test** | Chạy ở worker; pin FFmpeg image/build, bounds input, lưu command/config/version/hash; audit codec/license. |
| CLI + coding-agent skill đọc URL | **Reject** | Không đưa vào product path; không cho external web text là source facts. |
| HyperFrames renderer | **Reject for current P1** | Revideo đang là quyết định renderer P1. Chỉ reconsider qua ADR/POC có evidence thay thế Revideo, không chạy song song hai DSL. |
| OmniVoice adapter | **Reject** | Không thêm default provider; VieNeu-TTS vẫn phải audit/benchmark/consent riêng qua `TtsProvider`. |
| Template CSS/HTML | **Reference only** | Không copy mặc định. Nếu một template cần dùng, pin upstream exact revision, xác minh license/font/assets, tạo NOTICE + asset manifest và re-author/brand it. |
| SFX downloader/library | **Reject** | Không scrape/download into release; chỉ dùng SFX đã có source/license/hash/attribution được audit, hoặc no-SFX. |
| Direct source-code copy | **Do not do now** | MIT permits it with notice, nhưng scope hiện không cần. Reimplementation nhỏ, tests thuộc OneVoice dễ chứng minh originality, provenance và adherence to ports hơn. |

## POC P1 tối thiểu nếu chọn tiếp tục

Mục tiêu POC không phải “tạo video từ URL”, mà là chứng minh **một artifact marketing có lineage và fallback**, không làm thay đổi P0.

1. Thêm một implementation `MediaProvider.render(RenderRequest)` trong worker; `RenderRequest` chỉ nhận `contentId`, revision, approved `ContentPassport`, approved asset refs và template ID/version. Đọc facts từ version/evidence, không từ prompt hay URL.
2. Dùng **một renderer duy nhất đã chốt (Revideo)** và một template OneVoice sở hữu hoặc đã có manifest. Dựng video dọc 3 scene từ fixture product; tạo subtitle từ chính `voiceText`; chọn `TtsProvider` fixture/no-voice trước, rồi VieNeu chỉ sau audit riêng.
3. Chạy job qua `ContentValidated/Approved` outbox với key `(contentId, revision, templateHash, rendererVersion)`; persist `JobRun`, trạng thái `PENDING/RUNNING/SUCCEEDED/FAILED`, correlation ID và `ContentArtifact` SHA-256 qua `MediaStorage` local.
4. Test tối thiểu: cùng request retry không sinh artifact/publish thứ hai; biến đổi price/promotion sau approve làm Truth Guard đánh dấu `STALE` và block publish; renderer/TTS down trả trạng thái `FAILED` có fallback text/pre-rendered; artifact record giữ template/provider/render version và source snapshot hash.
5. Gate POC: render được trong worker (không block request), test ở bước 4 pass, `ffmpeg -buildconf`/SBOM/media-font-template inventory được lưu, và một rehearsal offline có artifact dự phòng. Nếu không qua gate, giữ video ngoài demo core.

## Reusable takeaway

`AI-auto-generate-video` là reference tốt cho *media-pipeline mechanics*, không phải subsystem marketing/sales có thể nhúng vào OneVoice. Giá trị tái sử dụng an toàn là pattern **structured storyboard → deterministic render → verified artifact**; phần OneVoice phải tự sở hữu là snapshot/evidence, approval, Truth Guard, job state, audit, provenance và fallback. Với các quyết định đã chốt, không clone code vào product và không thêm HyperFrames/OmniVoice; POC P1 chỉ đi qua `MediaProvider` với renderer/TTS/assets đã audit.
