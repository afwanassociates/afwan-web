<script setup lang="ts">
import ArrowIcon from '@/components/ArrowIcon.vue'
import HeroSlider from '@/components/HeroSlider.vue'
import SectionHeading from '@/components/SectionHeading.vue'
import ServiceCard from '@/components/ServiceCard.vue'
import { company } from '@/data/company'
import { slides } from '@/data/slides'
import { services } from '@/data/services'
import { reasons, steps } from '@/data/content'
import { stats } from '@/data/stats'
import { testimonials } from '@/data/testimonials'
import { faqs } from '@/data/faqs'
import { scrollToSection } from '@/lib/scroll'

const highlights = [
  'Local and overseas placement',
  'Skilled, semi-skilled and unskilled workforce',
  'Visa, documentation and pre-departure support',
]

const sectionClass = 'scroll-mt-20 py-20 focus:outline-none sm:scroll-mt-24 sm:py-24 lg:py-28'
const containerClass = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'
</script>

<template>
  <h1 class="sr-only">{{ company.name }} — manpower recruitment and supply</h1>

  <HeroSlider :slides="slides" label="Afwan Associates highlights" />

  <!-- Our Services -->
  <section id="services" :class="[sectionClass, 'bg-blush']" aria-labelledby="services-heading">
    <div :class="containerClass">
      <SectionHeading
        id="services-heading"
        title="Our Services"
        subtitle="End-to-end recruitment support for employers and job seekers, at home and overseas."
      />
      <ul class="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="service in services" :key="service.id">
          <ServiceCard :service="service" />
        </li>
      </ul>
    </div>
  </section>

  <!-- About Us + figures -->
  <section
    id="about"
    :class="[sectionClass, 'bg-primary-900 text-primary-100']"
    data-surface="dark"
    aria-labelledby="about-heading"
  >
    <div :class="[containerClass, 'grid items-center gap-12 lg:grid-cols-2 lg:gap-16']">
      <div>
        <SectionHeading
          id="about-heading"
          title="People-first manpower solutions"
          align="left"
          dark
        />
        <div class="mt-6 space-y-4 leading-relaxed">
          <p>
            {{ company.name }} is a manpower recruitment and supply company. We help employers find
            reliable skilled and unskilled workers, and help job seekers find genuine opportunities
            at home and overseas.
          </p>
          <p>
            <strong class="font-semibold text-white">Our mission</strong> is to make recruitment
            simple, transparent and fair — matching the right people to the right jobs while
            supporting workers at every step, from selection to deployment.
          </p>
        </div>
        <ul class="mt-6 space-y-3">
          <li v-for="item in highlights" :key="item" class="flex items-start gap-3">
            <span class="gloss-badge mt-0.5 h-6 w-6 shrink-0 rounded-full" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                class="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <span class="text-white">{{ item }}</span>
          </li>
        </ul>
        <p
          class="mt-6 rounded-lg border border-dashed border-accent-400/70 bg-white/5 px-4 py-3 text-sm"
        >
          [Placeholder: add your recruiting licence / registration number and year of establishment
          here.]
        </p>
        <a
          href="#contact"
          class="btn btn-accent btn-icon mt-8"
          @click.prevent="scrollToSection('contact')"
        >
          Talk to Our Team <ArrowIcon />
        </a>
      </div>

      <dl class="grid grid-cols-2 gap-4 sm:gap-6">
        <div
          v-for="stat in stats"
          :key="stat.label"
          class="flex flex-col-reverse rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8"
        >
          <dt class="mt-2 text-sm sm:text-base">{{ stat.label }}</dt>
          <dd class="text-3xl font-semibold text-accent-400 sm:text-4xl">{{ stat.value }}</dd>
        </div>
      </dl>
    </div>
  </section>

  <!-- How It Works -->
  <section id="how-it-works" :class="sectionClass" aria-labelledby="how-heading">
    <div :class="containerClass">
      <SectionHeading
        id="how-heading"
        title="How It Works"
        subtitle="A clear four-step process from your first enquiry to workers on site."
      />
      <div class="relative mt-16">
        <!-- Dashed line connecting the steps on large screens -->
        <div
          class="pointer-events-none absolute top-8 right-[12%] left-[12%] hidden border-t-2 border-dashed border-primary-200 lg:block"
          aria-hidden="true"
        />
        <ol class="relative grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <li v-for="(step, i) in steps" :key="step.title" class="text-center">
            <span
              class="gloss-badge relative mx-auto h-16 w-16 rounded-full text-xl font-semibold ring-8 ring-white"
              aria-hidden="true"
            >
              {{ String(i + 1).padStart(2, '0') }}
            </span>
            <h3 class="mt-6 text-xl font-semibold text-ink">
              <span class="sr-only">Step {{ i + 1 }}: </span>{{ step.title }}
            </h3>
            <p class="mx-auto mt-3 max-w-xs leading-relaxed text-muted">
              {{ step.description }}
            </p>
          </li>
        </ol>
      </div>
    </div>
  </section>

  <!-- Why Choose Us -->
  <section :class="[sectionClass, 'bg-blush']" aria-labelledby="why-heading">
    <div :class="containerClass">
      <SectionHeading
        id="why-heading"
        title="Why Choose Us"
        subtitle="What employers and workers can expect when they work with us."
      />
      <ul class="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <li v-for="reason in reasons" :key="reason.title" class="glass-card hover-lift p-6 sm:p-7">
          <span class="gloss-badge gloss-badge-primary h-12 w-12 rounded-full" aria-hidden="true">
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
          <h3 class="mt-5 text-lg font-semibold text-ink">{{ reason.title }}</h3>
          <p class="mt-2 leading-relaxed text-muted">{{ reason.description }}</p>
        </li>
      </ul>
    </div>
  </section>

  <!-- Testimonials -->
  <section :class="sectionClass" aria-labelledby="testimonials-heading">
    <div :class="containerClass">
      <SectionHeading
        id="testimonials-heading"
        title="What Our Clients Say"
        subtitle="Feedback from employers and workers we have worked with."
      />
      <ul class="mt-14 grid gap-6 md:grid-cols-3">
        <li v-for="item in testimonials" :key="item.id">
          <figure class="glass-card flex h-full flex-col p-6 sm:p-8">
            <svg
              class="h-10 w-10 text-accent-400"
              viewBox="0 0 32 32"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M4 18c0-6 3.6-10.4 9-12l1.2 2.4C10.8 10 9.4 12.4 9.2 15H14v11H4zm14 0c0-6 3.6-10.4 9-12l1.2 2.4c-3.4 1.6-4.8 4-5 6.6H28v11H18z"
              />
            </svg>
            <blockquote class="mt-5 flex-1 leading-relaxed text-slate-700">
              <p>{{ item.quote }}</p>
            </blockquote>
            <figcaption class="mt-6 border-t border-stroke pt-5">
              <p class="font-semibold text-ink">{{ item.name }}</p>
              <p class="text-sm text-muted">{{ item.role }}</p>
            </figcaption>
          </figure>
        </li>
      </ul>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq" :class="[sectionClass, 'bg-surface']" aria-labelledby="faq-heading">
    <div :class="[containerClass, 'grid gap-12 lg:grid-cols-12']">
      <div class="lg:col-span-5">
        <SectionHeading
          id="faq-heading"
          title="Frequently Asked Questions"
          subtitle="Answers to common questions from employers and job seekers. Can't find yours? Get in touch."
          align="left"
        />
        <a
          href="#contact"
          class="btn btn-primary btn-icon mt-8"
          @click.prevent="scrollToSection('contact')"
        >
          Contact Us <ArrowIcon />
        </a>
      </div>
      <div class="space-y-4 lg:col-span-7">
        <details
          v-for="(faq, i) in faqs"
          :key="faq.id"
          name="faq"
          class="group rounded-2xl border border-stroke bg-white open:shadow-[0_16px_40px_-28px_rgb(0_0_100/0.35)]"
          :open="i === 0"
        >
          <summary
            class="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-5 text-lg font-semibold text-ink sm:px-6 [&::-webkit-details-marker]:hidden"
          >
            {{ faq.question }}
            <span
              class="gloss-badge h-8 w-8 shrink-0 rounded-full transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </summary>
          <p class="px-5 pb-5 leading-relaxed text-muted sm:px-6">{{ faq.answer }}</p>
        </details>
      </div>
    </div>
  </section>

  <!-- Call to action -->
  <section class="py-16 sm:py-20" aria-labelledby="cta-heading">
    <div :class="containerClass">
      <div
        class="relative isolate overflow-hidden rounded-[1.75rem] bg-primary-900 px-6 py-12 text-center text-white sm:rounded-[2.5rem] sm:px-12 sm:py-16"
        data-surface="dark"
      >
        <div
          class="pointer-events-none absolute -top-20 -right-16 -z-10 h-72 w-72 rounded-full bg-accent-400/25 blur-3xl"
          aria-hidden="true"
        />
        <h2 id="cta-heading" class="text-3xl font-semibold tracking-tight sm:text-4xl">
          Need workers or <span class="text-accent-400">looking for a job?</span>
        </h2>
        <p class="mx-auto mt-4 max-w-xl text-primary-100">
          Get in touch and our team will guide you through every step.
        </p>
        <a
          href="#contact"
          class="btn btn-accent btn-icon mt-8"
          @click.prevent="scrollToSection('contact')"
        >
          Contact Us <ArrowIcon />
        </a>
      </div>
    </div>
  </section>
</template>
