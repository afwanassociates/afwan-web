<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { company } from '@/data/company'
import { services } from '@/data/services'
import { sectionLinks } from '@/data/navigation'
import { useSectionNav } from '@/composables/useSectionNav'

const goToSection = useSectionNav()
const year = new Date().getFullYear()

const quickLinks = sectionLinks.filter((link) => link.id !== 'contact')

const phoneHref = `tel:${company.phone.replace(/[^+\d]/g, '')}`
const emailHref = `mailto:${company.email.replace(/[[\]]/g, '')}`

const headingClass = 'text-lg font-semibold text-white'
const linkClass = 'rounded-sm transition-colors hover:text-accent-400'
</script>

<template>
  <footer class="bg-primary-900 text-primary-200" data-surface="dark">
    <div
      class="mx-auto grid max-w-7xl gap-10 px-4 pt-16 pb-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:pt-20"
    >
      <div class="lg:col-span-4">
        <!-- Logo on a white chip so its dark-red tones stay visible on navy -->
        <span class="inline-block rounded-xl bg-white px-4 py-2.5">
          <img src="/images/logo.png" alt="" width="960" height="202" class="h-9 w-auto" />
        </span>
        <p class="mt-5 text-lg font-semibold text-white">{{ company.name }}</p>
        <p class="mt-3 max-w-sm text-sm leading-relaxed">{{ company.tagline }}</p>
      </div>

      <nav aria-labelledby="footer-quick-links" class="lg:col-span-2">
        <h2 id="footer-quick-links" :class="headingClass">Quick Links</h2>
        <ul class="mt-5 space-y-3 text-sm">
          <li v-for="link in quickLinks" :key="link.id">
            <a :href="`/#${link.id}`" :class="linkClass" @click.prevent="goToSection(link.id)">
              {{ link.label }}
            </a>
          </li>
          <li>
            <RouterLink to="/login" :class="linkClass">Staff Login</RouterLink>
          </li>
        </ul>
      </nav>

      <nav aria-labelledby="footer-services" class="lg:col-span-3">
        <h2 id="footer-services" :class="headingClass">Our Services</h2>
        <ul class="mt-5 space-y-3 text-sm">
          <li v-for="service in services" :key="service.id">
            <a href="/#services" :class="linkClass" @click.prevent="goToSection('services')">
              {{ service.title }}
            </a>
          </li>
        </ul>
      </nav>

      <div id="contact" class="scroll-mt-24 focus:outline-none lg:col-span-3">
        <h2 :class="headingClass">Contact Us</h2>
        <address class="mt-5 space-y-4 text-sm not-italic">
          <p class="flex gap-3">
            <svg
              class="mt-0.5 h-5 w-5 shrink-0 text-accent-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              aria-hidden="true"
            >
              <path
                d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"
              />
            </svg>
            <span>
              <span class="sr-only">Phone: </span>
              <a :href="phoneHref" :class="linkClass">{{ company.phone }}</a>
            </span>
          </p>
          <p class="flex gap-3">
            <svg
              class="mt-0.5 h-5 w-5 shrink-0 text-accent-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              aria-hidden="true"
            >
              <path d="M3 6h18v12H3z" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            <span>
              <span class="sr-only">Email: </span>
              <a :href="emailHref" :class="linkClass">{{ company.email }}</a>
            </span>
          </p>
          <p class="flex gap-3">
            <svg
              class="mt-0.5 h-5 w-5 shrink-0 text-accent-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              aria-hidden="true"
            >
              <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
              <path d="M9.5 10a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0" />
            </svg>
            <span><span class="sr-only">Address: </span>{{ company.address }}</span>
          </p>
        </address>
      </div>
    </div>

    <div class="border-t border-white/10">
      <p class="mx-auto max-w-7xl px-4 py-6 text-center text-sm text-primary-300 sm:px-6 lg:px-8">
        &copy; {{ year }} {{ company.name }}. All rights reserved.
      </p>
    </div>
  </footer>
</template>
