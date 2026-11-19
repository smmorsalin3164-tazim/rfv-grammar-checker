RFV Grammar Checker — Free hosting + আলাদা user progress

ফোল্ডারে যা আছে:
- index.html: মূল ৪১টি passage ও grammar tool; Access Code login যুক্ত
- admin.html: Access Code তৈরি/বাতিল করার Admin Panel
- functions/api/: Cloudflare Pages API
- schema.sql: D1 database tables
- wrangler.toml: Cloudflare Pages configuration template

Cloudflare-এ সেটআপ:
1) Cloudflare account খুলে Workers & Pages > Create > Pages > Connect to Git বেছে নাও। এই ফোল্ডারের সব ফাইল GitHub repository-তে upload করে connect করো। Build command ফাঁকা রাখো; output directory হিসেবে / (root) দাও।
2) Workers & Pages > D1 > Create database: rfv-progress।
3) D1 Console-এ schema.sql-এর SQL চালাও।
4) Pages project > Settings > Functions > D1 database bindings-এ Variable name DB দিয়ে rfv-progress database bind করো।
5) Pages project > Settings > Variables and Secrets-এ ADMIN_KEY নামে একটি Secret যোগ করো। শক্তিশালী, দীর্ঘ, গোপন মান ব্যবহার করো।
6) Deploy করো। তারপর তোমার-domain/admin.html খুলে Admin Key দিয়ে Connect করো; Create Code দিয়ে প্রত্যেক ব্যক্তির জন্য আলাদা কোড বানাও।
7) index.html-এর ওয়েব ঠিকানা ব্যবহারকারীদের দাও। তারা নিজস্ব কোড দিয়ে ঢুকবে।

গুরুত্বপূর্ণ:
- প্রতিটি Access Code-ই একটি আলাদা ব্যবহারকারী/Progress bucket। একই কোড কাউকে শেয়ার করলে একই Progress দেখা যাবে।
- কোড বাতিল করলে তার সক্রিয় session-গুলোও বাতিল হবে।
- Session ৩০ দিন পর মেয়াদোত্তীর্ণ হবে; এরপর একই Access Code দিয়ে আবার লগইন করা যাবে।
- Admin Key কাউকে দেবে না এবং HTML/JS-এ বসাবে না।
- এটি বিনামূল্যের Cloudflare Pages + D1 Free tier-এর সীমার মধ্যে চলার জন্য তৈরি। Cloudflare-এর বর্তমান Free plan limits ও শর্ত বদলাতে পারে; অতিরিক্ত ব্যবহার হলে খরচ/সীমা আসতে পারে।
- Progress server-side রাখা হয়; তবে ব্যবহারকারী নিজের browser/devtools দিয়ে নিজের পাঠানো উত্তর বদলাতে পারে। এটি পরীক্ষার নিরাপত্তা/প্রক্টরিং ব্যবস্থা নয়।

স্থানীয়ভাবে শুধু index.html double-click করে খুললে API কাজ করবে না। Cloudflare Pages-এ deploy করার পরই Access Code login এবং server progress কাজ করবে।
