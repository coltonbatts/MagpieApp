# Stage 4 Fixture Images

Place 2-3 representative local test images here (PNG or JPEG) for manual Stage 4 visual verification.

Suggested set:

- one portrait/photo with soft gradients
- one high-contrast graphic/comic image
- one image with small isolated regions/noisy texture

The ignored harness test writes outputs to:

- `$TMPDIR/magpie-stage4-fixtures/<fixture_name>/draft/stage4.svg`
- `$TMPDIR/magpie-stage4-fixtures/<fixture_name>/draft/legend.json`
- `$TMPDIR/magpie-stage4-fixtures/<fixture_name>/draft/preview.png`

...and the same for `standard` and `highdetail`.
