📌 EOnlineBazar — Project Overview & Developer Guide

১. প্রজেক্টের পরিচয় (Core Scope):
* এটি একটি সম্পূর্ণ এন্টারপ্রাইজ-গ্রেড ই-কমার্স সিস্টেম (ওয়েবসাইট, অ্যাডমিন প্যানেল এবং মোবাইল অ্যাপ)।
* প্রজেক্টটিতে ৩টি প্রধান পিলার রয়েছে:
  - ERP: ইনভেন্টরি, পারচেজ অর্ডার, পজ (POS), কুরিয়ার অটো-সিঙ্ক (Steadfast/Pathao/RedX), এবং Profit & Loss রিপোর্ট।
  - CRM: অ্যাবান্ডন্ড কার্ট রিকভারি, সাপোর্ট টিকেট, রেফারেল, মার্কেটিং এবং সিলভার/গোল্ড/প্ল্যাটিনাম লয়ালটি টায়ার।
  - HRM: রোল-বেসড অ্যাক্সেস (RBAC), অ্যাটেনডেন্স (GPS সহ), পে-রোল (PDF পে-স্লিপ), ও লিভ ম্যানেজমেন্ট।

২. টেকনোলজি স্ট্যাক (Tech Stack):
* Backend: Node.js, Express.js (Modular MVC), MongoDB Atlas, Redis (Caching), PDFKit, Cron Jobs.
* Frontend: Vanilla JavaScript (Modular ES Architecture), HTML5, CSS3. (কোনো ভারী ফ্রেমওয়ার্ক নেই)
* Mobile App: React Native & Expo SDK.
* DevOps/Hosting: DigitalOcean Ubuntu Droplet, PM2, Nginx, Cloudinary (Media).

৩. কোডিং ও ডেভেলপমেন্ট নিয়ম (Core Rules):
* Modular Frontend: মেইন ব্যারেলে (admin-core.js, admin.css) সরাসরি কোড না লিখে সবসময় js/admin/modules/ বা css/admin/ ফোল্ডারে মডিউল বানিয়ে ইম্পোর্ট করতে হবে।
* Global Functions: HTML-এর onClick বা ইভেন্ট ফাংশনগুলো `window.functionName = fn` হিসেবে গ্লোবাল স্কোপে এক্সপোজ করতে হবে।
* No Restructure: `backend/src/routes/` এর ফোল্ডার ও ফাইল স্ট্রাকচার কখনো পরিবর্তন করা যাবে না।
* Testing: কোড পুশ করার আগে অবশ্যই `npm test` চালাতে হবে (বর্তমানে ১২৬/১২৬টি টেস্ট পাস অবস্থায় আছে)।

৪. শুরুতেই যা পড়তে হবে (Documentation Checklist):
1. README.md - প্রজেক্টের সামারি ও লোকাল সেটআপ গাইড।
2. .cursorrules - কোড লেখার সময় মেনে চলার বাধ্যতামূলক নিয়মাবলী।
3. ARCHITECTURE.md - ফুল-স্ট্যাক ফোল্ডার স্ট্রাকচারের বিস্তারিত।
4. REFACTOR_MAP.md - কোন ফিচারটি কোন ফাইলে লেখা হয়েছে তার ম্যাপ।










# Payment due

১. OpenAI API Credit (AI Chatbot-এর জন্য)
- কেন লাগবে: ওয়েবসাইটে এআই কাস্টমার সাপোর্ট/চ্যাট সার্ভিস চালুর জন্য।
- বর্তমান অবস্থা: ব্যালেন্স শেষ হয়ে গেছে (Quota Exceeded Error)।
- পেমেন্টের লিংক: https://platform.openai.com/settings/organization/billing
- কাজ: নতুন করে Payment Credits যোগ করা।

২. UltraMsg Subscription (WhatsApp API-এর জন্য)
- কেন লাগবে: হোয়াটসঅ্যাপ নোটিফিকেশন সার্ভিস চালুর জন্য।
- বর্তমান অবস্থা: বিল বাকি থাকায় সার্ভিস স্থগিত (Payment Stopped/Account Suspended)।
- পেমেন্টের লিংক: https://ultramsg.com/
- কাজ: ড্যাশবোর্ডে গিয়ে সাবস্ক্রিপশন ফি বা ইনভয়েস রিচার্জ/রিনিউ করা।











