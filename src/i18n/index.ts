import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enJobs from "./locales/en/jobs.json";
import enCronBuilder from "./locales/en/cronBuilder.json";
import zhCommon from "./locales/zh/common.json";
import zhJobs from "./locales/zh/jobs.json";
import zhCronBuilder from "./locales/zh/cronBuilder.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        jobs: enJobs,
        cronBuilder: enCronBuilder,
      },
      zh: {
        common: zhCommon,
        jobs: zhJobs,
        cronBuilder: zhCronBuilder,
      },
    },
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "jobs", "cronBuilder"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
