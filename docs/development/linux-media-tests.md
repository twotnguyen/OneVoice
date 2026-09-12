# Linux media validation

Run from the repository root with Docker Desktop using Linux containers:

```powershell
docker build -f Dockerfile.test -t onevoice-validation .
docker run --rm onevoice-validation
```

The test image installs the locked dependencies, FFmpeg/ffprobe and DejaVu fonts. It runs TypeScript, ESLint and all Vitest tests with `ONEVOICE_E2E=1`, one worker at a time. It does not mount the workspace or load its `.env`; `.dockerignore` excludes credentials, references and business media. The build fails if `.env` or `references` is present in the image. Registry/package downloads require internet access during build.

The determinism test renders two 1080×1920, 12-second videos, probes the results and compares SSIM. It has a 120-second timeout because the default five seconds is insufficient on the local Docker CPU (measured about 8.5 seconds). Other tests keep their own existing limits; assertions and fixture resolution are unchanged.

This proves the tested FFmpeg path and fixture-based worker behavior. AI providers, Supabase, Meta publishing and VNPay are not live integration tests here. It does not demonstrate the final HyperFrames hybrid video quality. Those checks belong to their implementation tasks and the release checklist.

To diagnose just the determinism test:

```powershell
docker run --rm onevoice-validation pnpm exec vitest run src/lib/video/determinism.e2e.test.ts --maxWorkers=1 --no-file-parallelism
```

Rebuild after source or lockfile changes; an older image validates only its build snapshot. Database permission tests run separately against explicitly local Supabase, following the staff bootstrap documentation.
