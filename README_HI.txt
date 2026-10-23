VASTRALINK - नया प्रोजेक्ट

1) इस ZIP को Extract करें।
2) VS Code में अंदर वाला VastraLink_Fresh फ़ोल्डर खोलें (जिसमें package.json और server.js हैं)।
3) .env.example की कॉपी बनाकर उसका नाम .env रखें।
4) .env खोलकर ADMIN_PASSWORD को अपना नया मजबूत पासवर्ड करें और SESSION_SECRET को लंबी random value से बदलें। उदाहरण:
   ADMIN_PASSWORD=ApnaNayaStrongPassword123!
   SESSION_SECRET=VastraLink-Session-9kR4pQ7x-ChangeThis
   पासवर्ड और secret किसी को न भेजें।
5) VS Code Terminal में चलाएँ:
   npm.cmd install
6) Install पूरा होने पर चलाएँ:
   npm.cmd start
7) ब्राउज़र में खोलें:
   http://localhost:3000
   Admin: http://localhost:3000/admin/login
   Username वही जो .env में ADMIN_USERNAME है (default admin)
   Password वही जो .env में ADMIN_PASSWORD रखा है।

जरूरी:
- पुरानी वेबसाइट का data इस नए प्रोजेक्ट में अपने-आप नहीं आएगा। पुराने data फ़ोल्डर की backup कॉपी सुरक्षित रखें।
- पुराने प्रोजेक्ट से नई वेबसाइट के server.js या data को सीधे overwrite न करें।
- वेबसाइट में sample products अपने-आप नहीं जोड़े गए हैं। Admin login करके product name, image URL और affiliate/product link भरकर Add product करें।
- Product image URL किसी image file का direct https URL होना चाहिए। Affiliate link में अपने approved affiliate program का सही tracking link लगाएँ।
- अगर port 3000 busy हो तो पुराना server terminal में Ctrl+C दबाकर रोकें, फिर npm.cmd start चलाएँ।
