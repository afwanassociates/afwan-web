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
  'Export and import of quality goods',
  'First-class construction and contracting',
  'Property and land development',
  'Supply of a wide range of goods (no explosives or chemicals)',
  'Solar energy for homes, buildings and public infrastructure',
]

/** Where solar energy is used, for the Solar section. */
const solarUses = [
  {
    title: 'Homes',
    description: 'Solar power for houses and apartments, to cut electricity bills and outages.',
    paths: ['M3 11.5 12 4l9 7.5', 'M5 10v10h14V10', 'M10 20v-5h4v5'],
  },
  {
    title: 'Buildings',
    description: 'Solar systems for offices, shops, factories and other commercial buildings.',
    paths: [
      'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17',
      'M4 21h16',
      'M10 7h4M10 11h4M10 15h4',
      'M11 21v-3h2v3',
    ],
  },
  {
    title: 'Public infrastructure',
    description: 'Clean, dependable power for public buildings, streets and community projects.',
    paths: ['M3 21h18', 'M5 21V10l7-5 7 5v11', 'M9 21v-6h6v6', 'M12 5V2'],
  },
]

// Links for the FAQ's "Still have questions?" card (placeholders until real details are set).
const phoneHref = `tel:${company.phone.replace(/[^+\d]/g, '')}`
const emailHref = `mailto:${company.email.replace(/[[\]]/g, '')}`

const sectionClass = 'scroll-mt-20 py-20 focus:outline-none sm:scroll-mt-24 sm:py-24 lg:py-28'
const containerClass = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'
</script>

<template>
  <h1 class="sr-only">{{ company.name }} — trade, construction and development</h1>

  <HeroSlider :slides="slides" label="Afwan Associates highlights" />

  <!-- Our Services: the company's main lines of business -->
  <section
    id="services"
    :class="[
      sectionClass,
      'bg-[radial-gradient(circle_at_8%_0%,#ffe1bb_0%,transparent_38%),linear-gradient(180deg,#fff3e6_0%,#fff8f1_100%)]',
    ]"
    aria-labelledby="services-heading"
  >
    <div :class="containerClass">
      <div class="mx-auto max-w-2xl text-center">
        <p class="flex items-center justify-center gap-3" aria-hidden="true">
          <img
            src="/images/logo-mark.png"
            alt=""
            width="196"
            height="202"
            class="h-12 w-auto sm:h-14"
            decoding="async"
          />
          <span class="text-xl font-semibold text-tone-flame sm:text-2xl">
            {{ company.name }}.
          </span>
        </p>
        <h2
          id="services-heading"
          class="mt-4 text-4xl font-semibold tracking-tight text-cocoa-950 sm:text-5xl lg:text-6xl"
        >
          Our Services
        </h2>
        <p class="mt-5 text-base leading-relaxed text-cocoa-700 sm:text-lg">
          Trade, construction and development solutions from one trusted partner in Dhaka.
        </p>
      </div>
      <ul class="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        <li v-for="service in services" :key="service.id">
          <ServiceCard :service="service" />
        </li>
        <!-- Brand card: a wide strip under the six services -->
        <li class="sm:col-span-2 lg:col-span-3">
          <div
            class="flex h-full flex-col gap-6 rounded-[1.75rem] bg-linear-to-br from-maroon-700 to-maroon-950 p-7 text-cream-100 shadow-[0_28px_56px_-28px_rgb(61_10_14/0.7)] sm:flex-row sm:items-center sm:p-8"
            data-surface="dark"
            data-brand-card
          >
            <img
              src="/images/logo-mark.png"
              alt=""
              width="196"
              height="202"
              class="h-20 w-auto shrink-0 self-start [filter:sepia(1)_saturate(2.4)_hue-rotate(2deg)_brightness(1.45)] sm:self-center"
              decoding="async"
            />
            <div>
              <p class="text-xl font-semibold text-tone-gold sm:text-2xl">{{ company.name }}.</p>
              <p class="mt-2 max-w-3xl leading-relaxed">
                One trusted partner for trade, contracting, development and solar energy. Supply
                excludes explosive materials and chemicals.
              </p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>

  <!-- Solar energy (opened by the solar banner's button) -->
  <section
    id="solar"
    :class="[sectionClass, 'relative isolate overflow-hidden bg-[#07070b] text-white']"
    data-surface="dark"
    aria-labelledby="solar-heading"
  >
    <div
      class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_88%_8%,rgb(255_196_74/0.55)_0%,rgb(240_160_40/0.2)_14%,transparent_38%),radial-gradient(circle_at_0%_100%,rgb(110_20_20/0.45),transparent_38%)]"
      aria-hidden="true"
    />
    <div :class="[containerClass, 'grid items-center gap-12 lg:grid-cols-12']">
      <div class="lg:col-span-5">
        <p class="text-xs font-semibold tracking-[0.35em] text-tone-gold uppercase sm:text-sm">
          Solar energy solutions
        </p>
        <h2
          id="solar-heading"
          class="mt-5 font-display text-4xl leading-tight font-bold sm:text-5xl"
        >
          Energy for a Brighter
          <span
            class="bg-linear-to-r from-[#f6cf7a] to-[#d18f2c] bg-clip-text pr-2 text-transparent italic"
            >Bangladesh.</span
          >
        </h2>
        <p class="mt-6 max-w-lg leading-relaxed text-white/75 sm:text-lg">
          Reliable solar energy solutions for homes, buildings and public infrastructure. Tell us
          about your site and power needs, and our team will advise you on the right solution.
        </p>
        <a
          href="#contact"
          class="mt-8 inline-flex items-center gap-3 rounded-full bg-linear-to-r from-[#f6d27f] to-[#cf8d2b] px-7 py-3.5 text-sm font-semibold text-[#1a1208] shadow-[0_10px_30px_-10px_rgb(240_170_60/0.8)] sm:text-base"
          @click.prevent="scrollToSection('contact')"
        >
          Talk to Us About Solar
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.25"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      </div>
      <ul class="grid gap-4 sm:grid-cols-3 lg:col-span-7">
        <li
          v-for="use in solarUses"
          :key="use.title"
          class="rounded-[1.5rem] bg-white/[0.06] p-6 ring-1 ring-white/15 backdrop-blur-md"
          :data-solar-use="use.title"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-8 w-8 text-tone-gold"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path v-for="d in use.paths" :key="d" :d="d" />
          </svg>
          <h3 class="mt-5 text-lg font-semibold">{{ use.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-white/70">{{ use.description }}</p>
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
          title="Your partner in trade, construction and development"
          align="left"
          dark
        />
        <div class="mt-6 space-y-4 leading-relaxed">
          <p>
            {{ company.name }} is a Dhaka-based company working in export and import, construction
            and contracting, property, land development, supply and solar energy. Businesses and
            individuals rely on one team for goods, buildings, sites and clean power.
          </p>
          <p>
            <strong class="font-semibold text-white">Our mission</strong> is to deliver every job to
            a high standard and on time, with clear prices and honest dealings from the first
            enquiry to the final handover.
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
          [Placeholder: add your trade licence / registration number and year of establishment
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

  <!-- How We Work: four steps, from enquiry to delivery -->
  <section
    id="how-it-works"
    :class="[sectionClass, 'bg-linear-to-b from-cream-50 to-[#fdf1e2]']"
    aria-labelledby="how-heading"
  >
    <div :class="containerClass">
      <div class="mx-auto max-w-2xl text-center">
        <p class="text-xs font-semibold tracking-[0.3em] text-tone-flame uppercase sm:text-sm">
          How we work
        </p>
        <h2
          id="how-heading"
          class="mt-4 text-3xl font-semibold tracking-tight text-cocoa-950 sm:text-4xl lg:text-5xl"
        >
          From enquiry to delivery
        </h2>
        <p class="mt-4 text-base leading-relaxed text-cocoa-700 sm:text-lg">
          A clear four-step process for every job, whatever the service.
        </p>
      </div>

      <div class="relative mt-14">
        <!-- Dotted line joining the steps on large screens -->
        <div
          class="pointer-events-none absolute top-[3.25rem] right-[12%] left-[12%] -z-0 hidden border-t-2 border-dotted border-tone-flame/40 lg:block"
          aria-hidden="true"
        />
        <ol class="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <li
            v-for="(step, i) in steps"
            :key="step.title"
            class="relative flex flex-col rounded-[1.5rem] p-7 shadow-[0_24px_50px_-30px_rgb(124_27_23/0.35)]"
            :class="
              i === steps.length - 1
                ? 'bg-linear-to-br from-maroon-700 to-maroon-950 text-cream-100'
                : 'bg-white ring-1 ring-cream-100'
            "
            :data-step="step.title"
          >
            <div class="flex items-center justify-between">
              <span
                class="flex h-14 w-14 items-center justify-center rounded-full"
                :class="
                  i === steps.length - 1
                    ? 'bg-tone-gold text-cocoa-950'
                    : 'bg-tone-flame text-white'
                "
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path v-for="d in step.icon" :key="d" :d="d" />
                </svg>
              </span>
              <span
                class="text-4xl font-bold tabular-nums"
                :class="i === steps.length - 1 ? 'text-tone-gold' : 'text-tone-flame/25'"
                aria-hidden="true"
              >
                {{ String(i + 1).padStart(2, '0') }}
              </span>
            </div>
            <h3
              class="mt-6 text-xl font-semibold"
              :class="i === steps.length - 1 ? 'text-white' : 'text-cocoa-950'"
            >
              <span class="sr-only">Step {{ i + 1 }}: </span>{{ step.title }}
            </h3>
            <p
              class="mt-2 leading-relaxed"
              :class="i === steps.length - 1 ? 'text-cream-100/85' : 'text-cocoa-700'"
            >
              {{ step.description }}
            </p>
          </li>
        </ol>
      </div>
    </div>
  </section>

  <!-- Why Choose Us -->
  <section
    :class="[sectionClass, 'relative isolate overflow-hidden bg-maroon-950 text-cream-100']"
    data-surface="dark"
    aria-labelledby="why-heading"
  >
    <div
      class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,rgb(239_180_58/0.18),transparent_40%),radial-gradient(circle_at_100%_100%,rgb(194_73_31/0.35),transparent_45%)]"
      aria-hidden="true"
    />
    <div :class="[containerClass, 'grid items-center gap-12 lg:grid-cols-12 lg:gap-16']">
      <div class="lg:col-span-5">
        <p class="text-xs font-semibold tracking-[0.3em] text-tone-gold uppercase sm:text-sm">
          Why choose us
        </p>
        <h2
          id="why-heading"
          class="mt-4 text-3xl leading-tight font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl"
        >
          One dependable team for <span class="text-tone-gold">every job.</span>
        </h2>
        <p class="mt-5 max-w-lg leading-relaxed text-cream-100/80 sm:text-lg">
          What our clients can expect when they work with us, whether it is goods, a building, a
          property or a site.
        </p>
        <a
          href="#contact"
          class="btn btn-accent btn-icon mt-8"
          @click.prevent="scrollToSection('contact')"
        >
          Work With Us <ArrowIcon />
        </a>
      </div>

      <ul class="grid gap-4 sm:grid-cols-2 lg:col-span-7 lg:gap-5">
        <li
          v-for="(reason, i) in reasons"
          :key="reason.title"
          class="rounded-[1.5rem] bg-white/[0.06] p-6 ring-1 ring-white/12 transition-colors hover:bg-white/[0.09] sm:p-7"
          :class="{ 'sm:translate-y-6': i % 2 === 1 }"
          :data-reason="reason.title"
        >
          <span
            class="flex h-12 w-12 items-center justify-center rounded-2xl bg-tone-gold/15 text-tone-gold ring-1 ring-tone-gold/30"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-6 w-6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path v-for="d in reason.icon" :key="d" :d="d" />
            </svg>
          </span>
          <h3 class="mt-5 text-lg font-semibold text-white">{{ reason.title }}</h3>
          <p class="mt-2 leading-relaxed text-cream-100/75">{{ reason.description }}</p>
        </li>
      </ul>
    </div>
  </section>

  <!-- Testimonials -->
  <section
    :class="[sectionClass, 'bg-linear-to-b from-cream-50 to-[#fdf1e2]']"
    aria-labelledby="testimonials-heading"
  >
    <div :class="containerClass">
      <div class="mx-auto max-w-4xl text-center">
        <p class="text-xs font-semibold tracking-[0.3em] text-tone-flame uppercase sm:text-sm">
          What our clients say
        </p>
        <h2
          id="testimonials-heading"
          class="mt-4 text-3xl font-semibold tracking-tight text-cocoa-950 sm:text-4xl lg:text-5xl"
        >
          Trusted by the people we work with
        </h2>
        <p class="mt-4 text-base leading-relaxed text-cocoa-700 sm:text-lg">
          Feedback from clients across trade, construction, property and supply.
        </p>
      </div>

      <ul class="mt-14 grid gap-6 md:grid-cols-3 md:items-stretch">
        <li v-for="(item, i) in testimonials" :key="item.id" :data-testimonial="item.id">
          <figure
            class="flex h-full flex-col rounded-[1.5rem] p-7 shadow-[0_24px_50px_-30px_rgb(124_27_23/0.35)] sm:p-8"
            :class="
              i === 1
                ? 'bg-linear-to-br from-maroon-700 to-maroon-950 text-cream-100 md:-translate-y-4'
                : 'bg-white ring-1 ring-cream-100'
            "
          >
            <span
              class="flex h-12 w-12 items-center justify-center rounded-full"
              :class="i === 1 ? 'bg-tone-gold text-cocoa-950' : 'bg-tone-gold/20 text-tone-flame'"
              aria-hidden="true"
            >
              <svg class="h-5 w-5" viewBox="0 0 32 32" fill="currentColor">
                <path
                  d="M4 18c0-6 3.6-10.4 9-12l1.2 2.4C10.8 10 9.4 12.4 9.2 15H14v11H4zm14 0c0-6 3.6-10.4 9-12l1.2 2.4c-3.4 1.6-4.8 4-5 6.6H28v11H18z"
                />
              </svg>
            </span>
            <blockquote
              class="mt-6 flex-1 text-lg leading-relaxed"
              :class="i === 1 ? 'text-white' : 'text-cocoa-950'"
            >
              <p>{{ item.quote }}</p>
            </blockquote>
            <figcaption
              class="mt-8 flex items-center gap-3 border-t pt-5"
              :class="i === 1 ? 'border-white/15' : 'border-cream-100'"
            >
              <span
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                :class="i === 1 ? 'bg-white/10 text-tone-gold' : 'bg-maroon-700 text-cream-100'"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M8 8a4 4 0 1 0 8 0 4 4 0 1 0-8 0" />
                  <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                </svg>
              </span>
              <span>
                <span
                  class="block font-semibold"
                  :class="i === 1 ? 'text-white' : 'text-cocoa-950'"
                  >{{ item.name }}</span
                >
                <span
                  class="block text-sm"
                  :class="i === 1 ? 'text-cream-100/70' : 'text-cocoa-700'"
                  >{{ item.role }}</span
                >
              </span>
            </figcaption>
          </figure>
        </li>
      </ul>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq" :class="[sectionClass, 'bg-white']" aria-labelledby="faq-heading">
    <div :class="[containerClass, 'grid gap-10 lg:grid-cols-12 lg:gap-14']">
      <div class="lg:col-span-5">
        <div class="lg:sticky lg:top-28">
          <p class="text-xs font-semibold tracking-[0.3em] text-tone-flame uppercase sm:text-sm">
            FAQ
          </p>
          <h2
            id="faq-heading"
            class="mt-4 text-3xl leading-tight font-semibold tracking-tight text-cocoa-950 sm:text-4xl lg:text-5xl"
          >
            Frequently asked <span class="text-tone-flame">questions</span>
          </h2>
          <p class="mt-4 max-w-md leading-relaxed text-cocoa-700 sm:text-lg">
            Answers to common questions about our services.
          </p>

          <!-- Still have questions? -->
          <div
            class="mt-8 rounded-[1.5rem] bg-linear-to-br from-maroon-700 to-maroon-950 p-7 text-cream-100 shadow-[0_28px_56px_-28px_rgb(61_10_14/0.7)]"
            data-surface="dark"
            data-faq-contact
          >
            <p class="text-xl font-semibold text-white">Still have questions?</p>
            <p class="mt-2 leading-relaxed text-cream-100/80">
              Our team is happy to help. Call or email us, or send your enquiry.
            </p>
            <ul class="mt-5 space-y-3 text-sm">
              <li>
                <a
                  :href="phoneHref"
                  class="inline-flex items-center gap-3 rounded-sm transition-colors hover:text-tone-gold"
                >
                  <svg
                    viewBox="0 0 24 24"
                    class="h-5 w-5 text-tone-gold"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"
                    />
                  </svg>
                  <span><span class="sr-only">Phone: </span>{{ company.phone }}</span>
                </a>
              </li>
              <li>
                <a
                  :href="emailHref"
                  class="inline-flex items-center gap-3 rounded-sm transition-colors hover:text-tone-gold"
                >
                  <svg
                    viewBox="0 0 24 24"
                    class="h-5 w-5 text-tone-gold"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 5h18v14H3z" />
                    <path d="M3 7l9 6 9-6" />
                  </svg>
                  <span><span class="sr-only">Email: </span>{{ company.email }}</span>
                </a>
              </li>
            </ul>
            <a
              href="#contact"
              class="btn btn-accent btn-icon mt-6"
              @click.prevent="scrollToSection('contact')"
            >
              Contact Us <ArrowIcon />
            </a>
          </div>
        </div>
      </div>

      <div class="space-y-3 lg:col-span-7">
        <details
          v-for="(faq, i) in faqs"
          :key="faq.id"
          name="faq"
          class="group rounded-2xl bg-cream-50 ring-1 ring-cream-100 transition-shadow open:bg-white open:shadow-[0_20px_44px_-28px_rgb(124_27_23/0.45)] open:ring-2 open:ring-maroon-700/70"
          :open="i === 0"
          :data-faq="faq.id"
        >
          <summary
            class="flex cursor-pointer list-none items-center gap-4 rounded-2xl px-5 py-5 sm:px-6 [&::-webkit-details-marker]:hidden"
          >
            <span
              class="w-7 shrink-0 text-sm font-bold text-tone-flame tabular-nums"
              aria-hidden="true"
              >{{ String(i + 1).padStart(2, '0') }}</span
            >
            <span class="flex-1 text-base font-semibold text-cocoa-950 sm:text-lg">{{
              faq.question
            }}</span>
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tone-gold/25 text-maroon-700 transition-all duration-200 group-open:rotate-45 group-open:bg-maroon-700 group-open:text-white motion-reduce:transition-none"
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
          <p class="pr-5 pb-5 pl-16 leading-relaxed text-cocoa-700 sm:pr-6 sm:pl-[4.25rem]">
            {{ faq.answer }}
          </p>
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
          Have a project or <span class="text-accent-400">an order in mind?</span>
        </h2>
        <p class="mx-auto mt-4 max-w-xl text-primary-100">
          Tell us what you need and our team will get back to you with a proposal.
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
