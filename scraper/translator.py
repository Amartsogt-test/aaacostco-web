"""
Hybrid Translation Module
- Google Translate: name, summary (fast, cheap)
- Gemini AI: description, specifications (quality)
"""

import os
import re
import time
import logging
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# ============ GOOGLE TRANSLATE (Fast) ============

def translate_with_google(text: str, target_lang: str = 'en') -> str:
    """
    Fast translation using Google Translate API
    Used for: name, summary
    target_lang: 'en' for English, 'mn' for Mongolian
    """
    if not text or len(text.strip()) == 0:
        return ""
    
    try:
        from google.cloud import translate_v2 as translate
        client = translate.Client()
        
        result = client.translate(text, target_language=target_lang)
        return result['translatedText']
    except ImportError:
        # Fallback to googletrans (free but less reliable)
        try:
            from googletrans import Translator
            translator = Translator()
            result = translator.translate(text, dest=target_lang)
            return result.text
        except Exception as e:
            logger.warning(f"Google Translate fallback failed: {e}")
            return text
    except Exception as e:
        logger.error(f"Google Translate error: {e}")
        return text


# ============ GEMINI AI (Quality) ============

def translate_with_gemini(text: str, target_lang: str = 'mn', context: str = 'product description') -> str:
    """
    Quality translation using Gemini AI
    Used for: description, specifications
    target_lang: 'mn' for Mongolian
    """
    if not text or len(text.strip()) == 0:
        return ""
    
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, falling back to Google Translate")
        return translate_with_google(text, target_lang)
    
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        lang_name = "Mongolian" if target_lang == 'mn' else "English"
        
        prompt = f"""Translate the following {context} from Korean to {lang_name}.
Keep brand names (Samsung, LG, Apple, etc.) in English.
Keep technical terms clear and understandable.
If the text contains HTML, preserve the HTML structure.

Korean text:
{text}

{lang_name} translation:"""
        
        response = model.generate_content(prompt)
        translated = response.text.strip()
        
        # Clean up any markdown code blocks if present
        if translated.startswith('```'):
            translated = re.sub(r'^```\w*\n?', '', translated)
            translated = re.sub(r'\n?```$', '', translated)
        
        return translated
        
    except Exception as e:
        logger.error(f"Gemini translation error: {e}")
        # Fallback to Google Translate
        return translate_with_google(text, target_lang)


def translate_specifications(specs: list) -> list:
    """
    Translate specifications list using Gemini for better quality
    Input: [{"name": "화면 크기", "value": "65인치"}, ...]
    Output: [{"name": "Дэлгэцийн хэмжээ", "value": "65 инч"}, ...]
    """
    if not specs or len(specs) == 0:
        return []
    
    if not GEMINI_API_KEY:
        # Fallback to simple translation
        translated = []
        for spec in specs:
            translated.append({
                "name": translate_with_google(spec.get("name", ""), "mn"),
                "value": translate_with_google(spec.get("value", ""), "mn")
            })
        return translated
    
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Format specs for translation
        specs_text = "\n".join([f"- {s.get('name', '')}: {s.get('value', '')}" for s in specs])
        
        prompt = f"""Translate these product specifications from Korean to Mongolian.
Keep brand names and model numbers in English.
Keep units (cm, kg, W, etc.) as-is.
Return in the same format.

Specifications:
{specs_text}

Mongolian translation:"""
        
        response = model.generate_content(prompt)
        translated_text = response.text.strip()
        
        # Parse the response back into list format
        translated = []
        for line in translated_text.split('\n'):
            line = line.strip()
            if line.startswith('- ') and ':' in line:
                line = line[2:]  # Remove "- "
                name, value = line.split(':', 1)
                translated.append({
                    "name": name.strip(),
                    "value": value.strip()
                })
        
        return translated if translated else specs
        
    except Exception as e:
        logger.error(f"Specifications translation error: {e}")
        return specs


# ============ SEARCH KEYWORDS ============

def generate_search_keywords(product: dict) -> list:
    """
    Generate search keywords from product data
    Combines English name, Mongolian name, brand, and category
    """
    keywords = set()
    
    # English name words
    name_en = product.get('name_en', '')
    if name_en:
        words = re.findall(r'\b\w+\b', name_en.lower())
        keywords.update(words)
    
    # Mongolian name words
    name_mn = product.get('name_mn', '')
    if name_mn:
        words = re.findall(r'\b\w+\b', name_mn.lower())
        keywords.update(words)
    
    # Brand
    brand = product.get('brand', '')
    if brand:
        keywords.add(brand.lower())
    
    # Category
    category = product.get('mainCategoryName', '')
    if category:
        keywords.add(category.lower())
    
    # Remove common words
    stop_words = {'the', 'a', 'an', 'and', 'or', 'with', 'for', 'in', 'on', 'at', 'to', 'of'}
    keywords = keywords - stop_words
    
    # Remove very short words
    keywords = [k for k in keywords if len(k) > 1]
    
    return list(keywords)[:30]  # Limit to 30 keywords


# ============ FULL PRODUCT TRANSLATION ============

def translate_product(product: dict) -> dict:
    """
    Translate a product using hybrid approach:
    - Google Translate for name, summary (fast)
    - Gemini AI for description, specifications (quality)
    """
    logger.info(f"Translating: {product.get('name', 'Unknown')[:50]}...")
    
    translated = {}
    
    # 1. Name -> English & Mongolian (Google Translate - fast)
    name = product.get('name', '')
    translated['name_en'] = translate_with_google(name, 'en')
    translated['name_mn'] = translate_with_google(name, 'mn')
    
    # 2. Summary -> English & Mongolian (Google Translate - fast)
    summary = product.get('summary', '')
    if summary:
        translated['summary_en'] = translate_with_google(summary, 'en')
        translated['summary_mn'] = translate_with_google(summary, 'mn')
    
    # 3. Description -> Mongolian only (Gemini AI - quality)
    description = product.get('description', '')
    if description:
        translated['description_mn'] = translate_with_gemini(description, 'mn', 'product description')
    
    # 4. Specifications -> Mongolian only (Gemini AI - quality)
    specifications = product.get('specifications', [])
    if specifications:
        translated['specifications_mn'] = translate_specifications(specifications)
    
    # 5. Ingredients -> Mongolian only (Gemini AI - quality, for food)
    ingredients = product.get('ingredients', '')
    if ingredients:
        translated['ingredients_mn'] = translate_with_gemini(ingredients, 'mn', 'food ingredients')
    
    # 6. Generate search keywords
    combined = {**product, **translated}
    translated['searchKeywords'] = generate_search_keywords(combined)
    
    # Mark as translated
    translated['needsTranslation'] = False
    
    logger.info(f"  ✓ Translated: {translated.get('name_en', '')[:50]}")
    
    return translated


# ============ TEST ============

if __name__ == "__main__":
    # Test translation
    test_product = {
        "name": "삼성 65인치 QLED 4K 스마트 TV",
        "summary": "최신 QLED 기술로 생생한 화질",
        "description": "<div>삼성의 최신 QLED TV는 퀀텀닷 기술로 10억 가지 색상을 표현합니다.</div>",
        "specifications": [
            {"name": "화면 크기", "value": "65인치"},
            {"name": "해상도", "value": "4K UHD"},
            {"name": "스마트 TV", "value": "예"}
        ],
        "brand": "Samsung"
    }
    
    result = translate_product(test_product)
    
    print("\n=== Translation Result ===")
    for key, value in result.items():
        print(f"{key}: {value}")
