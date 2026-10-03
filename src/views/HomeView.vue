<script setup lang="ts">
import HeroSlider from '@/components/HeroSlider.vue'
import ServiceCard from '@/components/ServiceCard.vue'
import { company } from '@/data/company'
import { slides } from '@/data/slides'
import { services } from '@/data/services'
import { reasons, steps } from '@/data/content'
import { scrollToSection } from '@/lib/scroll'
</script>

<template>
  <h1 class="sr-only">{{ company.name }} — manpower recruitment and supply</h1>

  <HeroSlider :slides="slides" label="Afwan Associates highlights" />

  <!-- About Us -->
  <section
    id="about"
    class="relative scroll-mt-20 overflow-hidden py-16 focus:outline-none sm:py-24"
    aria-labelledby="about-heading"
  >
    <div
      class="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-accent-200/40 blur-3xl"
      aria-hidden="true"
    />
    <div
      class="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8"
    >
      <div>
        <p class="text-sm font-semibold tracking-wider text-accent-700 uppercase">About us</p>
        <h2 id="about-heading" class="mt-2 text-3xl font-bold text-primary-900 sm:text-4xl">
          People-first manpower solutions
        </h2>
        <div
          class="mt-4 h-1 w-20 rounded-full bg-linear-to-r from-gold-400 to-accent-600"
          aria-hidden="true"
        />
      </div>
      <div
        class="glass-card space-y-4 p-6 text-base leading-relaxed text-slate-700 sm:p-8 sm:text-lg"
      >
        <p>
          {{ company.name }} is a manpower recruitment and supply company. We help employers find
          reliable skilled and unskilled workers, and help job seekers find genuine opportunities at
          home and overseas.
        </p>
        <p>
          <strong class="font-semibold text-primary-900">Our mission</strong> is to make recruitment
          simple, transparent and fair — matching the right people to the right jobs while
          supporting workers at every step, from selection to deployment.
        </p>
        <p
          class="rounded-md border border-dashed border-accent-500 bg-accent-50 px-4 py-3 text-sm text-slate-700"
        >
          [Placeholder: add your recruiting licence / registration number and year of establishment
          here.]
        </p>
      </div>
    </div>
  </section>

  <!-- Our Services -->
  <section
    id="services"
    class="relative scroll-mt-20 overflow-hidden bg-linear-to-b from-primary-50 to-white py-16 focus:outline-none sm:py-24"
    aria-labelledby="services-heading"
  >
    <div
      class="pointer-events-none absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-accent-300/25 blur-3xl"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute bottom-0 -left-32 h-96 w-96 rounded-full bg-primary-300/30 blur-3xl"
      aria-hidden="true"
    />
    <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="max-w-2xl">
        <p class="text-sm font-semibold tracking-wider text-accent-700 uppercase">What we do</p>
        <h2 id="services-heading" class="mt-2 text-3xl font-bold text-primary-900 sm:text-4xl">
          Our Services
        </h2>
        <p class="mt-4 text-slate-600">
          End-to-end recruitment support for employers and job seekers.
        </p>
      </div>
      <ul class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="service in services" :key="service.id">
          <ServiceCard :service="service" />
        </li>
      </ul>
    </div>
  </section>

  <!-- How It Works -->
  <section
    id="how-it-works"
    class="scroll-mt-20 py-16 focus:outline-none sm:py-24"
    aria-labelledby="how-heading"
  >
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="max-w-2xl">
        <p class="text-sm font-semibold tracking-wider text-accent-700 uppercase">Our process</p>
        <h2 id="how-heading" class="mt-2 text-3xl font-bold text-primary-900 sm:text-4xl">
          How It Works
        </h2>
      </div>
      <div class="relative mt-12">
        <!-- Connecting line between steps on large screens -->
        <div
          class="pointer-events-none absolute top-7 right-[12%] left-[12%] hidden h-0.5 bg-linear-to-r from-primary-200 via-accent-300 to-primary-200 lg:block"
          aria-hidden="true"
        />
        <ol class="relative grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <li v-for="(step, i) in steps" :key="step.title" class="relative text-center">
            <span
              class="gloss-badge gloss-badge-primary relative mx-auto h-14 w-14 rounded-full text-xl font-bold ring-4 ring-white"
              aria-hidden="true"
            >
              {{ i + 1 }}
            </span>
            <h3 class="mt-4 text-lg font-semibold text-primary-900">
              <span class="sr-only">Step {{ i + 1 }}: </span>{{ step.title }}
            </h3>
            <p class="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">
              {{ step.description }}
            </p>
          </li>
        </ol>
      </div>
    </div>
  </section>

  <!-- Why Choose Us -->
  <section
    class="relative overflow-hidden bg-linear-to-br from-primary-50 via-white to-accent-50 py-16 sm:py-24"
    aria-labelledby="why-heading"
  >
    <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="max-w-2xl">
        <p class="text-sm font-semibold tracking-wider text-accent-700 uppercase">Why us</p>
        <h2 id="why-heading" class="mt-2 text-3xl font-bold text-primary-900 sm:text-4xl">
          Why Choose Us
        </h2>
      </div>
      <ul class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <li v-for="reason in reasons" :key="reason.title" class="glass-card hover-lift p-6">
          <span class="gloss-badge h-11 w-11 rounded-full" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <h3 class="mt-4 font-semibold text-primary-900">{{ reason.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ reason.description }}</p>
        </li>
      </ul>
    </div>
  </section>

  <!-- Call to action -->
  <section
    class="relative isolate overflow-hidden bg-linear-to-br from-primary-900 via-primary-800 to-primary-950 text-white"
    data-surface="dark"
    aria-labelledby="cta-heading"
  >
    <div class="sheen pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
    <div
      class="pointer-events-none absolute -top-20 right-10 -z-10 h-72 w-72 rounded-full bg-accent-500/35 blur-3xl"
      aria-hidden="true"
    />
    <div
      class="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"
    >
      <div>
        <h2 id="cta-heading" class="text-2xl font-bold sm:text-3xl">
          Need workers or <span class="text-brand-gradient">looking for a job?</span>
        </h2>
        <p class="mt-2 text-primary-100">Get in touch and our team will guide you.</p>
      </div>
      <a
        href="#contact"
        class="btn btn-accent shrink-0"
        @click.prevent="scrollToSection('contact')"
      >
        Contact Us
      </a>
    </div>
  </section>
</template>
