#!/usr/bin/env bash
#
# Seed media generation skill documents into the admin API.
# Usage: ADMIN_URL=https://your-worker.example.com ./scripts/seed-skills.sh
#
# Requires: curl, and Cloudflare Access credentials (cookies/headers) if auth is enabled.
# Alternatively, use the admin UI: Skills → New Skill and paste the content.
#
set -euo pipefail

ADMIN_URL="${ADMIN_URL:?Set ADMIN_URL to your worker's base URL}"

put_skill() {
  local name="$1"
  local content="$2"
  echo "Uploading skill: ${name}..."
  curl -s -X PUT "${ADMIN_URL}/api/admin/skills/${name}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg c "$content" '{content: $c}')" \
    -o /dev/null -w "  → HTTP %{http_code}\n"
}

# --- media-prompt-engineering ---
put_skill "media-prompt-engineering" "# Media Prompt Engineering

## Service Selection Guide
- **Kling AI** (\`generate_video\`): Cinematic video clips, drone shots, motion content, product reveals
- **Flux Pro** (\`generate_image\`): Photorealistic images, portraits, landscapes, product photography
- **Ideogram** (\`generate_graphic\`): Graphics with readable text — thumbnails, quote cards, headers, announcements

## Platform Dimensions
- Instagram feed: 1024x1024 (square)
- Instagram/TikTok Stories: 768x1024 or 9:16 aspect
- Twitter/X: 1024x576 (16:9)
- YouTube thumbnail: 1280x720 (16:9)
- Pinterest: 768x1024 (2:3)

## Viral Content Patterns
- Use emotional hooks: surprise, curiosity, awe, humor
- High contrast and saturated colors stop the scroll
- Curiosity gaps: show partial information that demands a click
- Faces and eyes draw attention — include people when relevant
- Bold, readable text for thumbnails (use Ideogram)

## Color Theory for Social Media
- Red/orange: energy, urgency, food content
- Blue/teal: trust, calm, tech content
- Yellow/gold: optimism, luxury, attention
- Pink/magenta: creativity, youth, beauty
- Dark backgrounds with bright accents for maximum contrast

## Workflow
1. Select the right tool based on content type
2. Craft a detailed, specific prompt
3. After generation, ALWAYS use \`send_media_to_chat\` to show the result
4. Offer to regenerate if the user wants changes"

# --- media-generation-kling ---
put_skill "media-generation-kling" "# Kling AI Video Generation

## Prompt Structure
\`[Camera movement] + [Subject] + [Environment] + [Lighting/mood] + [Style]\`

## Camera Movement Vocabulary
- Dolly in/out: smooth forward/backward movement
- Crane shot: vertical sweeping movement
- Tracking shot: following a subject laterally
- Slow zoom: gradual focal length change
- Aerial pan: bird's-eye view sweeping across landscape
- Orbit: circling around a subject
- Steadicam: smooth handheld following movement

## Negative Prompt (Always Include)
Default: \`blurry, low quality, watermark, text overlay, jittery, distorted\`
Add specifics as needed: \`shaky camera, morphing faces, extra limbs\`

## Aspect Ratio Guide
- 16:9 — YouTube, landscape cinematic, Twitter video
- 9:16 — TikTok, Instagram Reels, YouTube Shorts
- 1:1 — Instagram feed video

## Duration Guide
- 5 seconds: punchy social clips, product reveals, transitions
- 10 seconds: cinematic establishing shots, storytelling sequences

## Lighting Descriptors
- Golden hour: warm, low-angle sunlight
- Blue hour: cool twilight tones
- Dramatic rim lighting: backlit edges, dark center
- Volumetric fog: atmospheric light rays
- Neon-lit: urban, cyberpunk feel
- Overhead noon: flat, bright (usually avoid)

## Example Prompts
- \`Slow aerial drone shot over misty mountain peaks at golden hour, volumetric fog between valleys, cinematic color grading, 4K quality\`
- \`Smooth tracking shot of a vintage car driving along a coastal highway, golden hour sunlight, lens flare, shallow depth of field, cinematic film look\`
- \`Slow dolly in on a steaming latte with latte art on a marble countertop, soft natural window light, warm tones, product commercial style\`"

# --- media-generation-flux ---
put_skill "media-generation-flux" "# Flux Pro Image Generation

## Prompt Structure
\`[Subject] + [Pose/Action] + [Setting] + [Lighting] + [Camera/Lens] + [Style]\`

## Photography Terms That Improve Quality
- \`shallow depth of field\` — blurred background, focused subject
- \`85mm f/1.4\` — portrait lens, beautiful bokeh
- \`35mm wide angle\` — environmental shots
- \`shot on Hasselblad\` — medium format quality
- \`cinematic color grading\` — film-like tones
- \`8K, ultra detailed\` — maximum sharpness

## Lighting Keywords
- Golden hour: warm, directional, long shadows
- Studio Rembrandt lighting: dramatic triangle on cheek
- Natural window light: soft, diffused, editorial
- Neon-lit: urban, saturated, night vibes
- Backlit silhouette: dramatic, moody
- Ring light: beauty, even facial lighting
- Overcast soft light: even, no harsh shadows

## Default Dimensions Per Platform
- Instagram feed: 1024x1024
- Twitter/YouTube: 1024x576
- Pinterest/Stories: 768x1024
- General landscape: 1024x768
- General portrait: 768x1024

## Style Modifiers
- Editorial photography: magazine-quality, styled
- Fashion campaign: high-end, dramatic lighting
- Product shot: clean background, studio lighting
- Environmental portrait: subject in natural setting
- Street photography: candid, urban, natural light
- Fine art: dramatic, painterly quality

## Example Prompts
- \`Professional headshot of a confident businessman in a navy suit, modern glass office background, natural window light, shallow depth of field, 85mm f/1.4, editorial photography\`
- \`Gourmet burger on a rustic wooden board, melting cheese, steam rising, dark moody background, overhead shot, food photography, shot on Phase One\`
- \`Aerial view of turquoise ocean waves crashing on white sand beach, drone photography, 4K, vibrant colors, travel magazine style\`"

# --- media-generation-ideogram ---
put_skill "media-generation-ideogram" "# Ideogram Graphic Generation

## Key Strength
Ideogram excels at rendering **readable text** inside images — something other AI image generators struggle with.

## Text in Prompts
- Always specify exact text in single quotes within the prompt
- Be explicit about placement: \`bold text at the top reading '...'\`
- Specify size: \`large centered text\`, \`small subtitle text\`
- Specify style: \`white bold sans-serif text\`, \`elegant script font\`

## Style Type Guide
- **DESIGN**: Clean graphics, flat design, illustrations, logos, infographics
- **REALISTIC**: Photo-composites with text overlays, realistic backgrounds with graphics
- **AUTO**: Let Ideogram decide (good default)

## Best Use Cases
- YouTube thumbnails (ASPECT_16_9, DESIGN or REALISTIC)
- Quote cards (ASPECT_1_1, DESIGN)
- Event announcements (ASPECT_1_1 or ASPECT_4_3, DESIGN)
- Social media headers (ASPECT_16_9, DESIGN)
- Motivational posters (ASPECT_9_16 for Stories, DESIGN)
- Infographic-style content (ASPECT_9_16, DESIGN)

## Magic Prompt
- **ON/AUTO**: Ideogram enhances your prompt for better results (recommended for most uses)
- **OFF**: Use your prompt exactly as written (for precise control)

## Example Prompts
- \`Bold YouTube thumbnail with large white text reading 'TOP 10 TIPS' at the top, red background with dramatic lighting, shocked face emoji, energetic design style\`
- \`Motivational quote card with elegant script text reading 'The best time to start is now' centered on a sunset gradient background, minimal clean design\`
- \`Professional event announcement graphic with bold text reading 'LIVE WEBINAR' at top and 'March 15, 2024' below, dark blue corporate background with subtle geometric patterns\`
- \`Instagram story graphic with large bold text reading 'SALE 50% OFF' in white on vibrant pink and purple gradient, confetti elements, retail promotion style\`"

echo ""
echo "Done! All 4 media skills uploaded."
echo "Verify in admin UI → Skills tab."
