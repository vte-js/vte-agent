<template>
  <svg class="agent-avatar" :class="{ speaking }" viewBox="0 0 100 100" width="64" height="64" fill="none">
    <!-- Full version -->
    <template v-if="!compact">
      <ellipse class="aura" cx="50" cy="48" rx="38" ry="40" fill="url(#auraGrad)" opacity="0.2"/>
      <ellipse class="head" cx="50" cy="48" rx="32" ry="34" fill="url(#headGrad)" stroke="#818cf8" stroke-width="1.5"/>
      <path class="v-mark" d="M44 24L50 33L56 24" stroke="#c4b5fd" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <g class="eye-group left-eye" transform="rotate(-5, 39, 44)">
        <ellipse class="eye-white" cx="39" cy="44" rx="7" ry="5" fill="#1e1b4b" stroke="#818cf8" stroke-width="1.2"/>
        <circle class="eye-pupil" cx="40" cy="45" r="3.5" fill="#a78bfa"/>
        <circle class="eye-glint" cx="38.5" cy="43" r="1.5" fill="#fff" opacity="0.9"/>
        <ellipse class="eye-lid" cx="39" cy="44" rx="7.5" ry="5.5" fill="#312e81" opacity="0"/>
      </g>
      <g class="eye-group right-eye" transform="rotate(-3, 61, 44)">
        <ellipse class="eye-white" cx="61" cy="44" rx="7" ry="5" fill="#1e1b4b" stroke="#818cf8" stroke-width="1.2"/>
        <circle class="eye-pupil" cx="62" cy="45" r="3.5" fill="#a78bfa"/>
        <circle class="eye-glint" cx="60.5" cy="43" r="1.5" fill="#fff" opacity="0.9"/>
        <ellipse class="eye-lid" cx="61" cy="44" rx="7.5" ry="5.5" fill="#312e81" opacity="0"/>
      </g>
      <path class="mouth" d="M42 62 Q50 67 58 62" stroke="#a78bfa" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle class="antenna" cx="50" cy="12" r="3.5" fill="#a78bfa"/>
      <line x1="50" y1="15.5" x2="50" y2="18" stroke="#818cf8" stroke-width="2"/>
      <defs>
        <radialGradient id="auraGrad" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stop-color="#6366f1"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
        <linearGradient id="headGrad" x1="50%" y1="14%" x2="50%" y2="82%">
          <stop offset="0%" stop-color="#4f46e5"/>
          <stop offset="100%" stop-color="#312e81"/>
        </linearGradient>
      </defs>
    </template>
    <!-- Compact version: fox icon -->
    <template v-else>
      <circle cx="50" cy="50" r="36" fill="#1e1e2e" stroke="none"/>
      <!-- Left ear -->
      <path d="M26 14L40 34L22 37Z" fill="#fff"/>
      <!-- Right ear -->
      <path d="M74 14L60 34L78 37Z" fill="#fff"/>
      <!-- Face -->
      <path d="M22 37Q22 52 34 60L50 68L66 60Q78 52 78 37L60 34Q50 40 40 34Z" fill="#fff"/>
      <!-- Eyes - larger -->
      <ellipse cx="40" cy="42" rx="3.5" ry="4" fill="#1e1e2e"/>
      <ellipse cx="60" cy="42" rx="3.5" ry="4" fill="#1e1e2e"/>
      <!-- Eye highlights -->
      <circle cx="38.5" cy="40.5" r="1.2" fill="#fff" opacity="0.8"/>
      <circle cx="58.5" cy="40.5" r="1.2" fill="#fff" opacity="0.8"/>
      <!-- Nose -->
      <ellipse cx="50" cy="56" rx="2.5" ry="2" fill="#1e1e2e"/>
    </template>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ speaking?: boolean; compact?: boolean }>()
</script>

<style scoped>
.agent-avatar { display: block; overflow: visible; }

.aura { animation: auraPulse 3s ease-in-out infinite; }
@keyframes auraPulse {
  0%, 100% { opacity: 0.15; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(1.05); }
}

.v-mark { animation: vPulse 3s ease-in-out infinite; }
@keyframes vPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.eye-lid { animation: eyeBlink 5s ease-in-out infinite; }
.left-eye .eye-lid { animation-delay: 0s; }
.right-eye .eye-lid { animation-delay: 0.06s; }
@keyframes eyeBlink {
  0%, 42%, 48%, 100% { opacity: 0; }
  44% { opacity: 0.9; }
  46% { opacity: 0.9; }
}

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

.eye-glint { animation: glintShift 4s ease-in-out infinite; }
.left-eye .eye-glint { animation-delay: 0.3s; }
.right-eye .eye-glint { animation-delay: 0.5s; }
@keyframes glintShift {
  0%, 100% { transform: translate(0, 0); opacity: 0.9; }
  50% { transform: translate(0.4px, -0.3px); opacity: 0.6; }
}

.antenna { animation: antennaPulse 2.5s ease-in-out infinite; }
@keyframes antennaPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* Speaking state */
.speaking .eye-pupil { animation: pupilActive 2.5s ease-in-out infinite; }
.speaking .eye-lid { animation: eyeBlink 2.8s ease-in-out infinite; }
.speaking .aura { animation: auraPulse 1.5s ease-in-out infinite; }
.speaking .antenna { animation: antennaPulse 1s ease-in-out infinite; }
.speaking .v-mark { animation: vPulse 1.5s ease-in-out infinite; }
.speaking .mouth { animation: mouthTalk 1.8s ease-in-out infinite; }

@keyframes pupilActive {
  0% { transform: translate(0, 0); }
  20% { transform: translate(1.2px, -0.5px); }
  40% { transform: translate(-0.5px, 0.8px); }
  60% { transform: translate(0.8px, 0.3px); }
  80% { transform: translate(-1px, -0.4px); }
  100% { transform: translate(0, 0); }
}

@keyframes mouthTalk {
  0%, 100% { d: path('M42 62 Q50 67 58 62'); }
  30% { d: path('M42 62 Q50 68.5 58 62'); }
  60% { d: path('M42 62 Q50 66 58 62'); }
}
</style>
