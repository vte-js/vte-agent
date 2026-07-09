<template>
  <svg class="agent-avatar" :class="{ speaking }" viewBox="0 0 100 100" width="100%" height="100%" fill="none">
    <!-- Full version: animated fox -->
    <template v-if="!compact">
      <!-- Soft aura glow -->
      <circle class="aura" cx="50" cy="50" r="44" fill="url(#auraGrad)" opacity="0.18"/>
      <!-- Circular background — soft gradient, no hard stroke -->
      <circle cx="50" cy="50" r="38" fill="url(#bgGrad)"/>
      <!-- Fox clipped to circle -->
      <g clip-path="url(#foxClip)">
        <!-- Left ear -->
        <path class="ear left-ear" d="M22 10L38 38L16 40Z" fill="url(#earGrad)"/>
        <!-- Right ear -->
        <path class="ear right-ear" d="M78 10L62 38L84 40Z" fill="url(#earGrad)"/>
        <!-- Inner ear left -->
        <path d="M26 18L36 36L20 37Z" fill="#c084fc" opacity="0.4"/>
        <!-- Inner ear right -->
        <path d="M74 18L64 36L80 37Z" fill="#c084fc" opacity="0.4"/>
        <!-- Face -->
        <path class="face" d="M16 40Q16 58 32 66L50 76L68 66Q84 58 84 40L62 38Q50 46 38 38Z" fill="url(#faceGrad)"/>
      <!-- Cheek blush left -->
      <ellipse cx="30" cy="52" rx="6" ry="4" fill="#c084fc" opacity="0.15"/>
      <!-- Cheek blush right -->
      <ellipse cx="70" cy="52" rx="6" ry="4" fill="#c084fc" opacity="0.15"/>
      <!-- Left eye -->
      <g class="eye-group left-eye" transform="rotate(-4, 38, 48)">
        <ellipse class="eye-white" cx="38" cy="48" rx="8" ry="6" fill="#1e1b4b" stroke="#818cf8" stroke-width="1.5"/>
        <circle class="eye-pupil" cx="39.5" cy="49" r="4" fill="#a78bfa"/>
        <circle class="eye-glint" cx="37" cy="46.5" r="1.8" fill="#fff" opacity="0.9"/>
        <ellipse class="eye-lid" cx="38" cy="48" rx="8.5" ry="6.5" fill="#3b2f6e" opacity="0"/>
      </g>
      <!-- Right eye -->
      <g class="eye-group right-eye" transform="rotate(-2, 62, 48)">
        <ellipse class="eye-white" cx="62" cy="48" rx="8" ry="6" fill="#1e1b4b" stroke="#818cf8" stroke-width="1.5"/>
        <circle class="eye-pupil" cx="63.5" cy="49" r="4" fill="#a78bfa"/>
        <circle class="eye-glint" cx="61" cy="46.5" r="1.8" fill="#fff" opacity="0.9"/>
        <ellipse class="eye-lid" cx="62" cy="48" rx="8.5" ry="6.5" fill="#3b2f6e" opacity="0"/>
      </g>
      <!-- Nose -->
      <ellipse class="nose" cx="50" cy="60" rx="3.5" ry="2.8" fill="#c084fc"/>
      <!-- Mouth -->
      <path class="mouth" d="M44 64 Q50 68 56 64" stroke="#a78bfa" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- Whisker left -->
      <line class="whisker w1" x1="18" y1="50" x2="32" y2="54" stroke="#818cf8" stroke-width="0.8" opacity="0.4"/>
      <line class="whisker w2" x1="16" y1="56" x2="32" y2="56" stroke="#818cf8" stroke-width="0.8" opacity="0.4"/>
      <!-- Whisker right -->
      <line class="whisker w3" x1="82" y1="50" x2="68" y2="54" stroke="#818cf8" stroke-width="0.8" opacity="0.4"/>
      <line class="whisker w4" x1="84" y1="56" x2="68" y2="56" stroke="#818cf8" stroke-width="0.8" opacity="0.4"/>
      </g>
      <defs>
        <radialGradient id="auraGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#818cf8"/>
          <stop offset="60%" stop-color="#4f46e5"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
        <radialGradient id="bgGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#2e2055"/>
          <stop offset="100%" stop-color="#1a1235"/>
        </radialGradient>
        <linearGradient id="faceGrad" x1="50%" y1="10%" x2="50%" y2="90%">
          <stop offset="0%" stop-color="#f0eaff"/>
          <stop offset="100%" stop-color="#ddd6fe"/>
        </linearGradient>
        <linearGradient id="earGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#e0d4ff"/>
          <stop offset="100%" stop-color="#c4b5fd"/>
        </linearGradient>
        <clipPath id="foxClip">
          <circle cx="50" cy="50" r="38"/>
        </clipPath>
      </defs>
    </template>
    <!-- Compact version: fox clipped in circle ring (matches icon.svg) -->
    <template v-else>
      <defs>
        <clipPath :id="'cc-'+uid">
          <circle cx="50" cy="50" r="38"/>
        </clipPath>
        <mask :id="'cm-'+uid">
          <rect width="100" height="100" fill="white"/>
          <ellipse cx="38" cy="48" rx="6" ry="5" fill="black" transform="rotate(-8 38 48)"/>
          <ellipse cx="62" cy="48" rx="6" ry="5" fill="black" transform="rotate(8 62 48)"/>
          <ellipse cx="50" cy="60" rx="3" ry="2.5" fill="black"/>
        </mask>
      </defs>
      <!-- Circle ring border -->
      <path fill-rule="evenodd" d="M50 4a46 46 0 1 0 0 92 46 46 0 0 0 0-92Zm0 8a38 38 0 1 1 0 76 38 38 0 0 1 0-76Z" fill="currentColor"/>
      <!-- Fox clipped inside circle -->
      <g :clip-path="'url(#cc-'+uid+')'" :mask="'url(#cm-'+uid+')'" fill="currentColor">
        <path d="M22 10L38 38L16 40Z"/>
        <path d="M78 10L62 38L84 40Z"/>
        <path d="M16 40Q16 58 32 66L50 76L68 66Q84 58 84 40L62 38Q50 46 38 38Z"/>
      </g>
    </template>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ speaking?: boolean; compact?: boolean }>()
const uid = Math.random().toString(36).slice(2, 8)
</script>

<style scoped>
.agent-avatar { display: block; overflow: visible; }

/* ── Aura ── */
.aura { animation: auraPulse 3s ease-in-out infinite; }
@keyframes auraPulse {
  0%, 100% { opacity: 0.15; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(1.05); }
}

/* ── Ear wiggle ── */
.left-ear { animation: earWiggleL 4s ease-in-out infinite; transform-origin: 30px 40px; }
.right-ear { animation: earWiggleR 4s ease-in-out infinite; transform-origin: 70px 40px; }
@keyframes earWiggleL {
  0%, 100% { transform: rotate(0); }
  50% { transform: rotate(-3deg); }
}
@keyframes earWiggleR {
  0%, 100% { transform: rotate(0); }
  50% { transform: rotate(3deg); }
}

/* ── Eye blink ── */
.eye-lid { animation: eyeBlink 5s ease-in-out infinite; }
.left-eye .eye-lid { animation-delay: 0s; }
.right-eye .eye-lid { animation-delay: 0.06s; }
@keyframes eyeBlink {
  0%, 42%, 48%, 100% { opacity: 0; }
  44% { opacity: 0.95; }
  46% { opacity: 0.95; }
}

/* ── Pupil drift ── */
.eye-pupil { animation: pupilDrift 7s ease-in-out infinite; }
.left-eye .eye-pupil { animation-delay: 0s; }
.right-eye .eye-pupil { animation-delay: 0.12s; }
@keyframes pupilDrift {
  0% { transform: translate(0, 0); }
  15% { transform: translate(0.8px, -0.3px); }
  35% { transform: translate(0.3px, 0.4px); }
  55% { transform: translate(-0.6px, 0.1px); }
  75% { transform: translate(-0.2px, -0.5px); }
  100% { transform: translate(0, 0); }
}

/* ── Glint shift ── */
.eye-glint { animation: glintShift 4s ease-in-out infinite; }
.left-eye .eye-glint { animation-delay: 0.3s; }
.right-eye .eye-glint { animation-delay: 0.5s; }
@keyframes glintShift {
  0%, 100% { transform: translate(0, 0); opacity: 0.9; }
  50% { transform: translate(0.4px, -0.3px); opacity: 0.6; }
}

/* ── Nose twitch ── */
.nose { animation: noseTwitch 3s ease-in-out infinite; }
@keyframes noseTwitch {
  0%, 100% { transform: translate(0, 0) scale(1); }
  30% { transform: translate(0.5px, -0.3px) scale(1.05); }
  60% { transform: translate(-0.3px, 0.2px) scale(0.98); }
}

/* ── Whisker sway ── */
.whisker { animation: whiskerSway 3s ease-in-out infinite; }
.w1 { animation-delay: 0s; }
.w2 { animation-delay: 0.3s; }
.w3 { animation-delay: 0.15s; }
.w4 { animation-delay: 0.45s; }
@keyframes whiskerSway {
  0%, 100% { transform: rotate(0); }
  50% { transform: rotate(2deg); }
}

/* ══════════════════════════════
   Speaking state
   ══════════════════════════════ */
.speaking .eye-pupil { animation: pupilActive 2.5s ease-in-out infinite; }
.speaking .eye-lid { animation: eyeBlink 2.8s ease-in-out infinite; }
.speaking .aura { animation: auraPulse 1.5s ease-in-out infinite; }
.speaking .ear { animation-duration: 1.5s; }
.speaking .nose { animation: noseTwitch 1.5s ease-in-out infinite; }
.speaking .mouth { animation: mouthTalk 1.8s ease-in-out infinite; }
.speaking .whisker { animation: whiskerSway 1.5s ease-in-out infinite; }

@keyframes pupilActive {
  0% { transform: translate(0, 0); }
  20% { transform: translate(1.2px, -0.5px); }
  40% { transform: translate(-0.5px, 0.8px); }
  60% { transform: translate(0.8px, 0.3px); }
  80% { transform: translate(-1px, -0.4px); }
  100% { transform: translate(0, 0); }
}

@keyframes mouthTalk {
  0%, 100% { d: path('M44 64 Q50 68 56 64'); }
  30% { d: path('M44 64 Q50 70 56 64'); }
  60% { d: path('M44 64 Q50 67 56 64'); }
}
</style>
