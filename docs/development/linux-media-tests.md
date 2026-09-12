# Linux media validation

Run from the repository root with Docker Desktop using Linux containers. Chrome Headless Shell needs `/dev/shm` ≥256 MB; pass `--shm-size=1g` on every run (the default 64 MB fails HyperFrames).

```powershell
docker build -f Dockerfile.test -t onevoice-validation .
docker image inspect onevoice-validation --format "{{.Id}} {{.Created}} {{.Size}}"
docker run --rm --shm-size=1g onevoice-validation
```

Record the inspect line as the image digest (Id), created timestamp, and size. Rebuild from `Dockerfile.test` after source or lockfile changes; an older image validates only its build snapshot.

The test image installs the locked dependencies, FFmpeg/ffprobe, DejaVu fonts, Chrome Headless runtime libraries (`libnss3` and Puppeteer/GTK deps), and runs `hyperframes browser ensure` at build so Chrome Headless Shell is present without a runtime download. It runs TypeScript, ESLint and all Vitest tests with `ONEVOICE_E2E=1`, one worker at a time. It does not mount the workspace or load its `.env`; `.dockerignore` excludes credentials, references and business media. The build fails if `.env` or `references` is present in the image. Registry/package downloads require internet access during build.

The determinism test renders two 1080×1920, 12-second videos, probes the results and compares SSIM. It has a 120-second timeout because the default five seconds is insufficient on the local Docker CPU (measured about 8.5 seconds). AT-034-04 in `src/lib/video/hybrid-scenes.test.ts` renders a real HyperFrames hybrid pipeline MP4 (H.264 yuv420p 1080×1920 with an audio track); its timeout covers Chrome capture, not the default five seconds. Other tests keep their own existing limits; assertions and fixture resolution are unchanged. Do not treat output byte-size as determinism.

This proves the tested FFmpeg path, fixture-based worker behavior, and the HyperFrames hybrid pipeline used by AT-034-04. AI providers, Supabase, Meta publishing and VNPay are not live integration tests here.

To diagnose just the determinism test:

```powershell
docker run --rm --shm-size=1g onevoice-validation pnpm exec vitest run src/lib/video/determinism.e2e.test.ts --maxWorkers=1 --no-file-parallelism
```

To diagnose AT-034-04 (HyperFrames hybrid MP4):

```powershell
docker run --rm --shm-size=1g onevoice-validation pnpm exec vitest run src/lib/video/hybrid-scenes.test.ts --maxWorkers=1 --no-file-parallelism
```

Database permission tests run separately against explicitly local Supabase, following the staff bootstrap documentation.
