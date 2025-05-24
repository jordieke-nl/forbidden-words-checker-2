import os, re
import streamlit as st
from dotenv import load_dotenv
import openai
from PyPDF2 import PdfReader

load_dotenv()

openai.api_base = os.getenv("API_BASE_URL")
openai.api_key = os.getenv("OPENAI_API_KEY")

with open("forbidden.txt", encoding="utf-8") as f:
    forbidden = [w.strip().lower() for w in f if w.strip()]

st.set_page_config(page_title="Forbidden Words Checker", layout="wide")
st.title("Forbidden Words Checker")

uploaded = st.file_uploader("Upload je pentest-rapport (PDF)", type="pdf")
if not uploaded:
    st.info("Upload een PDF om te beginnen.")
    st.stop()

reader = PdfReader(uploaded)
matches = []

for i, page in enumerate(reader.pages, start=1):
    text = page.extract_text() or ""
    parts = re.split(r"(\d+\.\d+\s+[^\n]+)", text)
    for j in range(1, len(parts), 2):
        sec_header = parts[j].strip()
        sec_num, sec_title = sec_header.split(maxsplit=1)
        sec_text = parts[j + 1]
        for word in forbidden:
            for match in re.finditer(rf"\b{re.escape(word)}\b", sec_text, flags=re.IGNORECASE):
                snippet = re.search(r"([^.]*\b" + re.escape(word) + r"\b[^.]*\.)", sec_text)
                context = snippet.group(1).strip() if snippet else sec_text[max(0, match.start()-30):match.end()+30]
                matches.append({
                    "page": i,
                    "sec_num": sec_num,
                    "sec_title": sec_title,
                    "word": word,
                    "context": context
                })

if not matches:
    st.success("Geen verboden woorden gevonden ✅")
else:
    for m in matches:
        st.markdown(f"### Pagina {m['page']} — Sectie {m['sec_num']} "{m['sec_title']}"")
        st.markdown(f"- **Verboden woord:** {m['word']}")
        st.markdown(f"- **Context:** _{m['context']}_")
        prompt = (
            f"In het volgende fragment komt een verboden woord voor: '{m['word']}'.\n"
            f"Fragment:\n\"{m['context']}\"\n\n"
            "Leg kort uit waarom dit fout is, en geef een verbeterde formulering."
        )
        resp = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[{"role":"user","content":prompt}],
            max_tokens=150
        )
        advice = resp.choices[0].message.content.strip().splitlines()
        why = advice[0] if advice else ""
        suggestion = advice[-1] if len(advice)>1 else ""
        st.markdown(f"- **Waarom fout:** {why}")
        st.markdown(f"- **Verbetering:** {suggestion}")
        st.write("---") 