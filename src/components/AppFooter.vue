<script setup lang="ts">
import { company } from '@/data/company'
import { useSectionNav } from '@/composables/useSectionNav'

const goToSection = useSectionNav()
const year = new Date().getFullYear()

const quickLinks = [
  { id: 'about', label: 'About Us' },
  { id: 'services', label: 'Our Services' },
  { id: 'how-it-works', label: 'How It Works' },
]

const phoneHref = `tel:${company.phone.replace(/[^+\d]/g, '')}`
const emailHref = `mailto:${company.email.replace(/[[\]]/g, '')}`
</script>

<template>
  <footer class="relative bg-primary-950 text-primary-100" data-surface="dark">
    <div class="h-1 bg-linear-to-r from-gold-400 via-accent-600 to-ember-700" aria-hidden="true" />
    <div class="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
      <div>
        <!-- Logo on a glossy white chip so its dark-red tones stay visible on the dark footer -->
        <span
          class="inline-block rounded-xl bg-linear-to-b from-white to-primary-50 px-4 py-3 shadow-[inset_0_1px_0_rgb(255_255_255),0_10px_24px_-12px_rgb(0_0_0/0.6)]"
        >
          <img src="/images/logo.png" alt="" width="960" height="202" class="h-9 w-auto" />
        </span>
        <p class="mt-4 text-lg font-bold text-white">{{ company.name }}</p>
        <p class="mt-3 max-w-xs text-sm leading-relaxed">{{ company.tagline }}</p>
      </div>

      <nav aria-labelledby="footer-quick-links">
        <h2
          id="footer-quick-links"
          class="text-sm font-semibold tracking-wider text-accent-300 uppercase"
        >
          Quick links
        </h2>
        <ul class="mt-4 space-y-2 text-sm">
          <li v-for="link in quickLinks" :key="link.id">
            <a
              :href="`/#${link.id}`"
              class="rounded-sm underline-offset-4 hover:text-white hover:underline"
              @click.prevent="goToSection(link.id)"
            >
              {{ link.label }}
            </a>
          </li>
        </ul>
      </nav>

      <div id="contact" class="scroll-mt-20 focus:outline-none">
        <h2 class="text-sm font-semibold tracking-wider text-accent-300 uppercase">Contact</h2>
        <address class="mt-4 space-y-2 text-sm not-italic">
          <p>
            <span class="text-primary-300">Phone:</span>
            <a :href="phoneHref" class="rounded-sm hover:text-white hover:underline">{{
              company.phone
            }}</a>
          </p>
          <p>
            <span class="text-primary-300">Email:</span>
            <a :href="emailHref" class="rounded-sm hover:text-white hover:underline">{{
              company.email
            }}</a>
          </p>
          <p>
            <span class="text-primary-300">Address:</span>
            {{ company.address }}
          </p>
        </address>
      </div>
    </div>

    <div class="border-t border-white/10">
      <p class="mx-auto max-w-7xl px-4 py-5 text-center text-xs text-primary-300 sm:px-6 lg:px-8">
        &copy; {{ year }} {{ company.name }}. All rights reserved.
      </p>
    </div>
  </footer>
</template>
