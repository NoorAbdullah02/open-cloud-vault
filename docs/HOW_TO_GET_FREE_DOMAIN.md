# 🌐 Complete Step-by-Step Guide: How to Claim a 100% Free Custom Developer Domain (`.is-a.dev`) & Unlimited Subdomains

> **Language:** Bengali (বাংলা) & English Comprehensive Guide  
> **Target:** Software Developers, Students, Competitive Programmers, and Open Source Builders  
> **Official Service:** [is-a.dev](https://is-a.dev) | **GitHub Registry:** [is-a-dev/register](https://github.com/is-a-dev/register)  
> **PDF Guide:** [Download PDF Version](./HOW_TO_GET_FREE_DOMAIN.pdf)

---

## 📑 সূচিপত্র (Table of Contents)
1. [ভূমিকা ও পরিচিতি (Introduction)](#1-ভূমিকা-ও-পরিচিতি-introduction)
2. [প্রয়োজনীয় পূর্বশর্ত (Prerequisites)](#2-প্রয়োজনীয়-পূর্বশর্ত-prerequisites)
3. [পর্ব ১: মূল রুট ডোমেইন পাওয়ার নিয়ম (Claiming Root Domain)](#পর্ব-১-মূল-রুট-ডোমেইন-পাওয়ার-নিয়ম-claiming-root-domain)
   - [ধাপ ১: ডোমেইন নাম নির্বাচন ও প্রাপ্যতা যাচাই](#ধাপ-১-ডোমেইন-নাম-নির্বাচন-ও-প্রাপ্যতা-যাচাই)
   - [ধাপ ২: গিটহাব রিপোজিটরি ফর্ক করা](#ধাপ-২-গিটহাব-রিপোজিটরি-ফর্ক-করা)
   - [ধাপ ৩: ডোমেইন কনফিগারেশন JSON ফাইল তৈরি](#ধাপ-৩-ডোমেইন-কনফিগারেশন-json-ফাইল-তৈরি)
   - [ধাপ ৪: Pull Request (PR) সাবমিট করা](#ধাপ-৪-pull-request-pr-সাবমিট-করা)
   - [ধাপ ৫: হোস্টিং প্ল্যাটফর্মে ডোমেইন কানেক্ট করা](#ধাপ-৫-হোস্টিং-প্ল্যাটফর্মে-ডোমেইন-কানেক্ট-করা)
4. [পর্ব ২: মূল ডোমেইনের পর সাবডোমেন নেওয়ার বিস্তারিত গাইড (Subdomains Guide)](#পর্ব-২-মূল-ডোমেইনের-পর-সাবডোমেন-নেওয়ার-বিস্তারিত-গাইড-subdomains-guide)
   - [সাবডোমেন কি এবং এর সুবিধা কী?](#সাবডোমেন-কি-এবং-এর-সুবিধা-কী)
   - [is-a.dev সাবডোমেন রুলস ও পলিসি](#is-adev-সাবডোমেন-রুলস-ও-পলিসি)
   - [সাবডোমেন তৈরির ধাপে ধাপে গাইড (Step-by-Step)](#সাবডোমেন-তৈরির-ধাপে-ধাপে-গাইড-step-by-step)
   - [বাস্তব জীবনের ৪টি ব্যবহারিক আর্কিটেকচার (Use-Cases)](#বাস্তব-জীবনের-৪টি-ব্যবহারিক-আর্কিটেকচার-use-cases)
5. [সাধারণ ভুলত্রুটি ও সমাধান (Troubleshooting & FAQs)](#সাধারণ-ভুলত্রুটি-ও-সমাধান-troubleshooting)

---

## 1. ভূমিকা ও পরিচিতি (Introduction)

সাধারণত একটি কাস্টম ডোমেইন (`.com`, `.dev`, `.net`) কিনতে বছরে ১০ থেকে ২০ ডলার খরচ করতে হয় এবং প্রতি বছর রিনিউ করতে হয়। শিক্ষার্থী এবং তরুণ ডেভেলপারদের জন্য এটি অনেক সময় ব্যয়বহুল।

**`is-a.dev`** হলো বিশ্বব্যাপী ডেভেলপারদের জন্য পরিচালিত একটি সম্পূর্ণ ফ্রি ও ওপেন সোর্স ডোমেইন সার্ভিস।
* **খরচ:** ১০০% আজীবন ফ্রি (No Hidden Cost, No Credit Card Required)।
* **নিরাপত্তা:** Cloudflare-এর হাই-স্পিড DNS এবং স্বয়ংক্রিয় ফ্রি SSL/TLS সার্টিফিকেট।
* **মালিকানা:** GitHub Pull Request-এর মাধ্যমে স্বচ্ছ ও নিরাপদ রেকর্ড কন্ট্রোল।
* **রেকর্ড সাপোর্ট:** CNAME, A, AAAA, TXT, MX, CAA, SRV সাপোর্ট।

---

## 2. প্রয়োজনীয় পূর্বশর্ত (Prerequisites)

আবেদন করার আগে নিশ্চিত করুন আপনার নিচের বিষয়গুলো প্রস্তুত আছে:

1. **একটি সক্রিয় GitHub অ্যাকাউন্ট:** (ডোমেইনের মালিকানা আপনার GitHub ইউজারনেমের সাথে যুক্ত থাকবে)।
2. **একটি সক্রিয় ওয়েবসাইট:** আপনার পোর্টফোলিও বা সফটওয়্যার প্রজেক্টটি অবশ্যই ইন্টারনেটে লাইভ থাকতে হবে (যেমন Render, Vercel, Netlify, GitHub Pages ইত্যাদিতে)।
   * *সতর্কতা: ফাঁকা (Under Construction) বা শুধু "Hello World" সাইট রিজেক্ট করা হয়।*
3. **সফটওয়্যার ডেভেলপমেন্ট সম্পর্কিত কন্টেন্ট:** আপনার মূল ডোমেইনটি অবশ্যই সফটওয়্যার ডেভেলপমেন্ট, পোর্টফোলিও, কোডিং বা ওপেন সোর্স সম্পর্কিত হতে হবে।

---

## পর্ব ১: মূল রুট ডোমেইন পাওয়ার নিয়ম (Claiming Root Domain)

### ধাপ ১: ডোমেইন নাম নির্বাচন ও প্রাপ্যতা যাচাই
আপনার পছন্দের নামটি খালি (Available) আছে কি না তা আগে যাচাই করে নিন:
1. আপনার ব্রাউজারে এই লিংকটি ওপেন করুন (আপনার পছন্দের নাম দিয়ে `yourname` পরিবর্তন করুন):
   ```text
   https://is-a.dev/available?d=yourname
   ```
2. যদি স্ক্রিনে **"Available"** মেসেজ দেখতে পান, তবে নামটি আপনি নিতে পারবেন।

> ⚠️ **মনে রাখুন:** `is-a.dev` মূল রুট ডোমেইনটি ডেভেলপারদের ব্যক্তিগত পোর্টফোলিও বা ইউজারনেমের জন্য দিয়ে থাকে (যেমন `noor.is-a.dev`)। তাই প্রথম ডোমেইন হিসেবে আপনার নিজের নাম বা গিটহাব ইউজারনেম নেওয়া সবচেয়ে নিরাপদ।

---

### ধাপ ২: গিটহাব রিপোজিটরি ফর্ক করা
1. ব্রাউজারে অফিশিয়াল রিপোজিটরিতে যান:  
   👉 **[https://github.com/is-a-dev/register](https://github.com/is-a-dev/register)**
2. উপরের ডানদিকের কোণায় থাকা **Fork** বাটনে ক্লিক করুন।
3. আপনার প্রোফাইলে রিপোজিটরিটি ফর্ক করে নিন।

---

### ধাপ ৩: ডোমেইন কনফিগারেশন JSON ফাইল তৈরি
1. আপনার ফর্ক করা রিপোজিটরিতে ঢুকুন।
2. **`domains/`** ফোল্ডারে প্রবেশ করুন।
3. **Add file** ➔ **Create new file**-এ ক্লিক করুন।
4. ফাইলের নাম দিন:  
   `yourname.json`  
   *(যেমন আপনার ডোমেইন যদি `noor.is-a.dev` হয়, তবে ফাইলের নাম হবে `noor.json`)*।

#### কোড ফরম্যাট (Render/Vercel/Cloudflare CNAME):
```json
{
  "owner": {
    "username": "YourGitHubUsername",
    "email": "your-email@gmail.com"
  },
  "records": {
    "CNAME": "your-app-name.onrender.com"
  }
}
```

---

### ধাপ ৪: Pull Request (PR) সাবমিট করা
1. আপনার ফর্ক করা রিপোর মূল পাতা থেকে **"Compare & pull request"** বাটনে ক্লিক করুন।
2. PR টাইটেল দিন: `Register yourname.is-a.dev`।
3. টেমপ্লেটের সবগুলো চেকবক্সের ভেতরের স্পেস সরিয়ে `[x]` করে দিন:

```markdown
# Requirements
- [x] I agree to the Terms of Service.
- [x] My file is following the domain structure.
- [x] My website is reachable and completed.
- [x] My website is software development related.
- [x] My website is not for commercial use.
- [x] I have provided sufficient contact information in the owner key.
- [x] I have provided a link to my website below.

# Website Preview
<!-- WEBSITE_PREVIEW_START -->
https://your-current-app.onrender.com
<!-- WEBSITE_PREVIEW_END -->

# Website Purpose
<!-- WEBSITE_PURPOSE_START -->
Personal portfolio website showcasing my software engineering projects and skills.
<!-- WEBSITE_PURPOSE_END -->
```

> **বট ভ্যালিডেশন:** PR দেওয়ার পর `CI / Tests` সফলভাবে পাস হলে মডারেটররা সাধারণত ১৫ মিনিট থেকে ৩ দিনের মধ্যে এটি মার্জ করে দেয়।

---

### ধাপ ৫: হোস্টিং প্ল্যাটফর্মে ডোমেইন কানেক্ট করা
PR মার্জ হয়ে যাওয়ার পর আপনার হোস্টিং প্ল্যাটফর্মে কাস্টম ডোমেইন যুক্ত করুন:
* **Render:** Service Settings ➔ Custom Domains ➔ Add Custom Domain (`yourname.is-a.dev`) ➔ সেভ করুন।
* **Vercel:** Project Settings ➔ Domains ➔ `yourname.is-a.dev` লিখে Add দিন।
* **GitHub Pages:** Repo Settings ➔ Pages ➔ Custom domain বক্সে নাম লিখে Save দিন এবং Enforce HTTPS অন করুন।

---

## পর্ব ২: মূল ডোমেইনের পর সাবডোমেন নেওয়ার বিস্তারিত গাইড (Subdomains Guide)

আপনি যখন একবার আপনার মূল ডোমেইনটি পেয়ে গেলেন (যেমন: `noor.is-a.dev`), এখন আপনার হাতে অসীম স্বাধীনতা! আপনি আপনার যেকোনো প্রজেক্ট, ব্যাকএন্ড API, ক্লাউড সার্ভিস, মোবাইল অ্যাপ ব্যাকএন্ড বা ব্লগের জন্য **আনলিমিটেড সাবডোমেন** তৈরি করতে পারবেন।

### সাবডোমেন কি এবং এর সুবিধা কী?
সাবডোমেন হলো আপনার মূল ডোমেইনের অধীনে তৈরি করা নির্দিষ্ট শাখার অ্যাড্রেস।
* যেমন Google-এর মূল ডোমেইন `google.com`, কিন্তু ড্রাইভে গেলে `drive.google.com`, মেইলে গেলে `mail.google.com`।
* আপনার ক্ষেত্রে:
  - মূল পোর্টফোলিও: **`https://noor.is-a.dev`**
  - পার্সোনাল ক্লাউড ড্রাইভ: **`https://drive.noor.is-a.dev`**
  - ব্যাকএন্ড এপিআই: **`https://api.noor.is-a.dev`**
  - ডকুমেন্টেশন: **`https://docs.noor.is-a.dev`**

#### সুবিধা:
1. **ব্র্যান্ডিং ও প্রফেশনালিজম:** যেকোনো ক্লায়েন্ট বা ইন্টারভিউয়ার দেখলে বুঝবে আপনি একজন দক্ষ ইঞ্জিনিয়ার যিনি সম্পূর্ণ সিস্টেম নিজের ডোমেইনের আওতায় সাজিয়েছেন।
2. **১০০% ফ্রি:** কোনো আলাদা ডোমেইন কেনা বা নতুন অ্যাকাউন্ট খোলার প্রয়োজন নেই।
3. **কোনো বিধিনিষেধ নেই:** রুট ডোমেইনের ক্ষেত্রে যেমন শুধু পোর্টফোলিও বাধ্যতামূলক ছিল, **নেস্টেড সাবডোমেনের ক্ষেত্রে যেকোনো সফটওয়্যার প্রজেক্ট, অ্যাপ বা ইউটিলিটি বৈধ!**

---

### is-a.dev সাবডোমেন রুলস ও পলিসি (Core Rules)

`is-a.dev`-এর আর্কিটেকচার অনুযায়ী সাবডোমেন নেওয়ার নিয়মগুলো হলো:

1. **প্যারেন্ট ওনারশিপ রুল (Parent Ownership Rule):**  
   আপনি যে ডোমেইনের আন্ডারে সাবডোমেন নিচ্ছেন (যেমন `noor`), সেই প্যারেন্ট ডোমেইনের ওনার যে GitHub অ্যাকাউন্ট (`NoorAbdullah02`), সাবডোমেন ফাইলের ওনারও সেই একই অ্যাকাউন্ট হতে হবে।
2. **ফাইল নেমিং রুল (Naming Syntax):**  
   ফাইলের নাম সবসময় হতে হবে:  
   `[subdomain].[parent-domain].json`  
   *উদাহরণ:* আপনি যদি `drive.noor.is-a.dev` চান, তবে ফাইলের নাম হবে:  
   👉 **`drive.noor.json`**
3. **আনলিমিটেড নেস্টিং (Unlimited Nesting):**  
   আপনি চাইলে সাবডোমেনের ভেতরেও সাবডোমেন নিতে পারেন (যেমন: `v1.api.noor.json` ➔ `https://v1.api.noor.is-a.dev`)।

---

### সাবডোমেন তৈরির ধাপে ধাপে গাইড (Step-by-Step)

#### ১. আপনার ফর্ক করা রিপোজিটরিতে যান
গিটহাবে গিয়ে আপনার আগের ফর্ক করা রিপোজিটরিতে ঢুকুন:  
`https://github.com/[Your-Username]/register`

> 💡 **প্রো-টিপ:** কাজ শুরু করার আগে রিপোর মূল পাতার **"Sync fork"** বাটনে ক্লিক করে আপস্ট্রিমের সাথে সিঙ্ক করে নিন।

#### ২. নতুন সাবডোমেন JSON ফাইল তৈরি করুন
`domains/` ফোল্ডারে গিয়ে **Add file > Create new file** দিন।  
ফাইলের নাম দিন: `drive.noor.json` (আপনার পছন্দের সাবডোমেন নাম অনুযায়ী)।

#### ৩. কনফিগারেশন কোড পেস্ট করুন
```json
{
  "owner": {
    "username": "YourGitHubUsername",
    "email": "your-email@gmail.com"
  },
  "records": {
    "CNAME": "your-cloud-project.onrender.com"
  }
}
```
*ফাইলটি সেভ ও Commit করুন।*

#### ৪. Pull Request সাবমিট করুন
আগের মতোই একটি PR তৈরি করুন:
* **PR Title:** `Register drive.noor.is-a.dev`
* **Template পূরণ:**
  - সব চেকবক্স `[x]` দিন।
  - `WEBSITE_PREVIEW_START` ট্যাগে আপনার লাইভ সার্ভিসের Render বা Vercel লিংক দিন।
  - `WEBSITE_PURPOSE_START` ট্যাগে লিখুন:  
    *"This is a nested subdomain for my personal cloud storage project hosted under my root domain (noor.is-a.dev)."*

#### ৫. হোস্টিং সার্ভিস কনফিগার করুন
PR মার্জ হওয়ার সাথে সাথে যে সার্ভিসের সাথে লিংক করেছেন (যেমন Render/Vercel) তার Custom Domains সেকশনে গিয়ে `drive.noor.is-a.dev` বসিয়ে দিন। Render নিজে থেকেই SSL সার্টিফিকেট দিয়ে সার্ভিস লাইভ করে দেবে!

---

### বাস্তব জীবনের ৪টি ব্যবহারিক আর্কিটেকচার (Use-Cases)

আপনি আপনার সাবডোমেনগুলোকে বিভিন্ন হোস্টিং সার্ভিসে কীভাবে ভাগ করে ব্যবহার করবেন তার চমৎকার একটি রূপরেখা নিচে দেওয়া হলো:

```
                          ┌──────────────────────────┐
                          │   noor.is-a.dev (Root)   │
                          │   [Portfolio Website]    │
                          │   Hosted on: Render / Vercel
                          └─────────────┬────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           │                            │                            │
           ▼                            ▼                            ▼
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│ drive.noor.is-a.dev  │     │  api.noor.is-a.dev   │     │  docs.noor.is-a.dev  │
│ [Cloud Storage App]  │     │ [Backend REST/NestJS]│     │ [Documentation Site] │
│ Hosted on: Render    │     │ Hosted on: Railway   │     │ Hosted on: Cloudflare│
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
```

| সাবডোমেন উদাহরণ | কাজের ধরণ | হোস্টিং প্ল্যাটফর্ম | রেকর্ডের ধরণ |
| :--- | :--- | :--- | :--- |
| **`drive.noor.is-a.dev`** | ফুলস্ট্যাক ক্লাউড ড্রাইভ ও ফাইল ম্যানেজার | Render | `CNAME` ➔ `noor-cloud-vault.onrender.com` |
| **`api.noor.is-a.dev`** | ব্যাকএন্ড NestJS বা FastAPI সার্ভার | Railway / Render | `CNAME` ➔ `api-service.up.railway.app` |
| **`docs.noor.is-a.dev`** | প্রজেক্টের টেকনিক্যাল ডকুমেন্টেশন বা উইকি | Cloudflare Pages | `CNAME` ➔ `noor-docs.pages.dev` |
| **`bot.noor.is-a.dev`** | টেলিগ্রাম বা ডিসকর্ড বট ওয়েবহুক | Fly.io / VPS | `A` ➔ `[Your Server IP]` |

---

## সাধারণ ভুলত্রুটি ও সমাধান (Troubleshooting)

| সমস্যা (Issue) | কারণ (Reason) | সমাধান (Solution) |
| :--- | :--- | :--- |
| **"Parent subdomain does not exist" এরর** | রুট ডোমেইন আগে অনুমোদন না নিয়েই সরাসরি সাবডোমেন ফাইল তৈরি করা। | আগে মূল ডোমেইনের (`noor.json`) PR মার্জ হতে হবে, তারপর সাবডোমেন নেওয়া যাবে। |
| **"Owner does not match the parent subdomain"** | সাবডোমেন ফাইলের `owner.username` মূল ডোমেইনের সাথে না মেলা। | আপনার গিটহাব ইউজারনেম হুবহু একই স্পেলিংয়ে ব্যবহার করুন। |
| **"Not Related to Software Development"** | রুট ডোমেইনের জন্য প্রজেক্টের নাম দিলে বা সাইট অসম্পূর্ণ থাকলে এই এরর দেয়। | রুট ডোমেইন সবসময় নিজের নাম/পোর্টফোলিওতে রাখুন। প্রজেক্টের জন্য নেস্টেড সাবডোমেন ব্যবহার করুন। |
| **SSL/HTTPS Warning দেখাচ্ছে** | হোস্টিং প্ল্যাটফর্মে SSL ইস্যু হতে ৫-১৫ মিনিট সময় লাগা। | ৫-১০ মিনিট অপেক্ষা করুন। রেন্ডার বা ভার্সেলে ভেরিফিকেশন কমপ্লিট হলে এসএসএল স্বয়ংক্রিয়ভাবে একটিভ হয়ে যাবে। |

---

<div align="center">
  <b>Developed & Documented for NOOR DRIVE Community Ecosystem</b><br/>
  © 2026 Sheikh Noor Abdullah. Open Source Knowledge Sharing.
</div>
