
from deep_translator import GoogleTranslator
import time

text_list = [
    "제품명",
    "올리타리아 유기농 엑스트라버진 올리브유 1L",
    "식품의 유형(농수축산물의 경우, 품목 또는 명칭)",
    "올리브유"
]

print("Attempting translation...")
try:
    translator = GoogleTranslator(source='auto', target='mn')
    translated = translator.translate_batch(text_list)
    print("\nResult:")
    for original, trans in zip(text_list, translated):
         print(f"{original} -> {trans}")
except Exception as e:
    print(f"Error: {e}")
