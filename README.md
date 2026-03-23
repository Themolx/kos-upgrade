# KOS Upgrade – FAMU Edition

Rozšíření do prohlížeče, které vylepšuje [KOS (AMU)](https://kos.amu.cz). Místo nudné KOS homepage uvidíš přehledný dashboard s rozvrhem, předměty, moduly a odpočtem do další hodiny.

![Chrome](https://img.shields.io/badge/Chrome-supported-brightgreen) ![Safari](https://img.shields.io/badge/Safari-experimental-orange)

---

## Co to umí

- **Dashboard** — rozvrh, předměty a moduly na jednom místě
- **Odpočet** — kolik minut zbývá do konce / začátku hodiny
- **Lichý/sudý týden** — hned vidíš, jestli máš tento týden výuku
- **Archiv sylabů** — stáhne ti sylabus ke každému předmětu, můžeš je číst offline
- **Nové moduly** — upozorní tě, když se objeví nový modul k zápisu
- **Rychlá navigace** — lišta s odkazy na všechny KOS stránky
- **Skrývání hodin** — můžeš schovat hodiny, které nechodíš (např. jiný paralelka)

---

## Instalace do Chrome (krok za krokem)

> Celý postup zabere asi 2 minuty. Nepotřebuješ nic instalovat, žádný terminál, žádný kód.

### 1. Stáhni soubory z GitHubu

1. Otevři tuto stránku: **[github.com/Themolx/kos-upgrade](https://github.com/Themolx/kos-upgrade)**
2. Klikni na zelené tlačítko **`<> Code`**
3. Zvol **`Download ZIP`**
4. Počkej, až se stáhne soubor (většinou do složky **Stažené soubory / Downloads**)
5. **Rozbal ZIP** — na Macu stačí dvakrát kliknout na stažený `.zip` soubor, na Windows klikni pravým a zvol "Extrahovat vše"
6. Zapamatuj si, kde rozbalená složka je (např. `~/Downloads/kos-upgrade-main/`)

### 2. Načti rozšíření do Chrome

1. Otevři Chrome a do adresního řádku napiš: **`chrome://extensions`** a stiskni Enter
2. Vpravo nahoře zapni přepínač **"Režim pro vývojáře"** (Developer mode)
3. Vlevo nahoře se objeví tlačítko **"Načíst rozbalené rozšíření"** (Load unpacked) — klikni na něj
4. Vyber složku, kterou jsi rozbalil/a v kroku 1 (tu, která obsahuje soubor `manifest.json`)
5. Hotovo! Rozšíření se objeví v seznamu

### 3. Otevři KOS

1. Jdi na **[kos.amu.cz](https://kos.amu.cz)** a přihlas se jako obvykle
2. Po přihlášení se místo normální stránky zobrazí **dashboard** s rozvrhem, předměty a moduly
3. Data se stáhnou automaticky na pozadí — nemusíš nic dělat

> **Tip:** Složku s rozšířením nesmaž a nepřesouvej! Chrome ji potřebuje. Pokud ji smažeš, rozšíření přestane fungovat.

---

## Instalace do Safari (pokročilé)

Safari rozšíření nejdou nainstalovat tak jednoduše jako v Chrome. Potřebuješ Mac s Xcode (zdarma z App Store).

1. Nainstaluj **[Xcode](https://apps.apple.com/app/xcode/id497799835)** z App Store (je zdarma, ale má ~7 GB)
2. Otevři **Terminál** (Spotlight → napiš "Terminal") a spusť:
   ```
   xcrun safari-web-extension-converter ~/Downloads/kos-upgrade-main --project-location ~/Desktop/kos-safari
   ```
   (uprav cestu `~/Downloads/kos-upgrade-main` podle toho, kam jsi rozbalil/a ZIP)
3. Otevře se Xcode s projektem — stiskni **⌘R** (nebo tlačítko ▶ vlevo nahoře)
4. Otevři **Safari → Nastavení → Pokročilé** a zapni **"Zobrazit funkce pro vývojáře"**
5. V menu **Safari → Vývoj** zapni **"Povolit nepodepsaná rozšíření"**
6. V **Safari → Nastavení → Rozšíření** zapni **KOS Upgrade – FAMU**
7. Jdi na [kos.amu.cz](https://kos.amu.cz) a přihlas se

> **Pozor:** "Povolit nepodepsaná rozšíření" se vypne pokaždé, když Safari restartuješ. Musíš to zapnout znovu.

---

## Jak to používat

Po přihlášení do KOS se automaticky zobrazí dashboard. Nemusíš nic nastavovat.

### Dashboard (hlavní stránka)

- **Nahoře** — dnešní datum, odpočet do konce/začátku hodiny, lichý/sudý týden
- **Rozvrh** — tvůj týdenní rozvrh v přehledné mřížce. Klikni na hodinu → zobrazí se sylabus
- **Předměty** — seznam zapsaných předmětů s kredity
- **Moduly** — nadcházející moduly s datem a místem

### Lišta s odkazy

Nahoře na stránce je rychlá navigace na všechny KOS stránky (Rozvrh, Předměty, Moduly, Výsledky, Zkoušky...). Klikni na **← Domů** pro návrat na dashboard.

### Obnovit data

Klikni na **"Obnovit data"** dole na dashboardu. Rozšíření na pozadí stáhne aktuální předměty, rozvrh a moduly — stránka se nepřenačítá, nemusíš nikam klikat. Tohle se děje i automaticky při každém otevření KOS.

### Archiv sylabů

- Klikni na **"Archivovat vše"** — rozšíření projde všechny tvoje předměty a stáhne sylabusy
- Klikni na **"Stáhnout archiv sylabu"** — uloží ti HTML soubor se všemi sylabusy, který si můžeš otevřít offline

### Skrývání hodin

Najeď myší na hodinu v rozvrhu a klikni na **×** — hodina se skryje pro daný den. Hodí se, pokud máš v rozvrhu paralelky, na které nechodíš. Skryté hodiny vrátíš přes odkaz **"Skryté položky"**.

### Lichý/sudý na stránce rozvrhu

Na stránce rozvrhu v KOS se u hodin, které jsou jen lichý nebo sudý týden, zobrazí malý štítek (**L** nebo **S**). Hodiny, které tento týden nemáš, jsou ztlumené.

---

## Aktualizace

Když vyjde nová verze:

1. Stáhni nový ZIP z GitHubu (stejný postup jako při instalaci)
2. Rozbal a **nahraď** starou složku novou
3. V `chrome://extensions` klikni na ikonu 🔄 (reload) u rozšíření KOS Upgrade

---

## Něco nefunguje?

- **Dashboard se nezobrazil** — zkontroluj, že jsi přihlášený/á v KOS. Rozšíření se aktivuje jen po přihlášení.
- **Rozvrh je prázdný** — klikni na "Obnovit data" a počkej pár sekund.
- **Chrome říká, že rozšíření je poškozené** — zkontroluj, že jsi vybral/a správnou složku (tu s `manifest.json`).
- **Po restartu Chrome rozšíření zmizelo** — v `chrome://extensions` ho znovu zapni.

---

## Pro vývojáře

### Struktura projektu

```
src/
  main.js            — vstupní bod, verzování cache
  utils.js           — sdílené utility (objekt KOS)
  homepage.js        — dashboard, mřížka rozvrhu, odpočet, archivace
  schedule.js        — vylepšení stránky rozvrhu + cachování
  scheduleEdit.js    — editor rozvrhu (skrývání, úpravy)
  subjects.js        — vylepšení stránek předmětů/modulů + cachování
  syllabusArchive.js — extrakce a ukládání sylabů
  weekParity.js      — badge lichý/sudý týden
  styles.css         — všechny styly rozšíření
manifest.json        — manifest Chrome rozšíření
icons/               — ikony rozšíření
```

### Jak to funguje

Rozšíření běží jako content script na `kos.amu.cz`. Při načtení stránky:
1. Detekuje přihlášení (hledá odkaz na logout)
2. Injektuje navigační lištu
3. Na homepage nahradí obsah dashboardem
4. Na pozadí stáhne aktuální data (předměty, rozvrh, moduly) přes skryté iframy
5. Data ukládá do `chrome.storage.local` — žádná data se nikam neodesílají

---

*Vytvořil Martin Tomek pro studenty FAMU. Žádná data se neodesílají — vše zůstává v tvém prohlížeči.*
