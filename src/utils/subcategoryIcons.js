// subcategoryIcons.js — pick a relevant lucide icon for a (sub)category from its
// label, so category tiles show a meaningful icon instead of one generic
// placeholder. Keyword-based, so it works across EVERY category automatically.
//
// Matching: the (sub)category label is lowercased and the FIRST rule whose any
// keyword appears as a substring wins. Order rules specific → generic (e.g.
// "гар утас" before "гар", "гал тогоо" before "тогоо"), since the first hit wins.
import {
    Tv, Monitor, Printer, Camera, Smartphone, Laptop, Cpu, Gamepad2, Music, Speaker,
    Video, Headphones, CookingPot, Refrigerator, WashingMachine, Microwave, Snowflake,
    Fan, Plug, Cable, BatteryCharging, Keyboard, Mouse, HardDrive, Router,
    Sofa, Lamp, Bed, Baby, Dumbbell, Bike, Plane, Tent, Sprout, Flower2, Trees,
    Shirt, Footprints, Backpack, Glasses, Watch, Gem, Sparkles, Scissors, Droplet,
    Heart, Pill, Wrench, Car, Utensils, GlassWater, Apple, Candy, Cookie, Milk, Beef,
    Fish, Coffee, Briefcase, BookOpen, PenTool, FileText, Package, Gift, ShoppingBag, Wine,
} from 'lucide-react';

/** @type {[string[], import('lucide-react').LucideIcon][]} */
const RULES = [
    // ----- Electronics / digital -----
    [['tv', 'телевиз', 'теле'], Tv],
    [['монитор', 'дэлгэц'], Monitor],
    [['принтер', 'хэвлэгч', 'сканнер', 'скан'], Printer],
    [['камер', 'дуран', 'фото'], Camera],
    [['гар утас', 'ухаалаг утас', 'смартфон', 'mobile', 'phone'], Smartphone],
    [['ноутбук', 'лаптоп', 'laptop'], Laptop],
    [['компьютер', 'тооцоол', 'процессор', 'pc'], Cpu],
    [['гарын товч', 'keyboard', 'гар (key'], Keyboard],
    [['хулгана', 'mouse'], Mouse],
    [['хатуу диск', 'ssd', 'hdd', 'хадгалах', 'санах ой', 'storage'], HardDrive],
    [['роутер', 'wifi', 'сүлжээ', 'router', 'модем'], Router],
    [['тоглоом', 'game', 'гэйм', 'консол', 'playstation', 'xbox'], Gamepad2],
    [['хөгжм', 'хөгжим', 'гитар', 'төгөлдөр'], Music],
    [['чихэвч', 'хедфон', 'наушник', 'чихний'], Headphones],
    [['аудио', 'чанга', 'спикер', 'дуу', 'колонк', 'speaker'], Speaker],
    [['видео', 'video'], Video],
    [['цэнэг', 'батарей', 'зай', 'аккумлятор', 'battery'], BatteryCharging],
    [['кабель', 'кабел', 'дагалдах', 'адаптер', 'цэнэглэгч'], Cable],

    // ----- Home appliances -----
    [['хөргөгч', 'фриз'], Refrigerator],
    [['угаалг', 'усан онгоц', 'washing'], WashingMachine],
    [['микро', 'зуух', 'духовк'], Microwave],
    [['гал тогоо'], CookingPot],
    [['том овор', 'том оврын'], Refrigerator],
    [['улирлын', 'агааржуул', 'халаагуур', 'дулаан'], Snowflake],
    [['сэнс', 'салхи', 'агаар'], Fan],
    [['цахилгаан хэрэгсэл', 'ахуйн цахилгаан'], Plug],

    // ----- Furniture / home -----
    [['тавилга', 'буйдан', 'сандал', 'ширээ'], Sofa],
    [['ор хөнжил', 'ор ', 'дэвсгэр', 'матрас', 'унтлага'], Bed],
    [['гэрэл', 'гэрэлт', 'чийдэн', 'лаа', 'lamp'], Lamp],

    // ----- Kids / toys -----
    [['хүүхэд', 'нярай', 'baby', 'хүүхдийн'], Baby],

    // ----- Sport / travel / outdoor -----
    [['спорт', 'фитнес', 'дасгал', 'биеийн тамир'], Dumbbell],
    [['дугуй', 'унадаг'], Bike],
    [['аялал', 'travel', 'нислэг'], Plane],
    [['кемп', 'майхан', 'зуслан', 'camping'], Tent],

    // ----- Garden / plants -----
    [['цэцэрлэг', 'ногоо', 'тариалан', 'үрслэг'], Sprout],
    [['цэцэг', 'flower'], Flower2],
    [['мод', 'ой'], Trees],

    // ----- Fashion -----
    [['гутал', 'shoe', 'пүүз'], Footprints],
    [['цүнх', 'богц', 'халаас', 'bag'], Backpack],
    [['нүдний шил', 'нарны шил', 'glasses', 'шил '], Glasses],
    [['хувцас', 'цамц', 'өмд', 'малгай', 'хүрэм', 'даашинз', 'загвар'], Shirt],

    // ----- Jewelry / watch / beauty -----
    [['цаг', 'watch'], Watch],
    [['гоёл', 'чимэглэл', 'эрдэнэ', 'алт', 'мөнгөн эдлэл', 'бөгж', 'ээмэг'], Gem],
    [['үнэртэн', 'сүрчиг', 'парфюм'], Droplet],
    [['үс ', 'үсний', 'сэвсэн', 'хайч'], Scissors],
    [['гоо сайхан', 'косметик', 'арьс', 'нүүр', 'будаг'], Sparkles],

    // ----- Health -----
    [['витамин', 'эм ', 'эмийн', 'нэмэлт', 'health', 'эрүүл'], Pill],
    [['зүрх', 'эмнэлэг'], Heart],

    // ----- Tools / auto -----
    [['багаж', 'tool', 'өрөм', 'хөрөө'], Wrench],
    [['авто', 'машин', 'тээвэр', 'дугуй (авто'], Car],

    // ----- Food & drink -----
    [['ундаа', 'уух', 'ус ', 'juice', 'шүүс'], GlassWater],
    [['дарс', 'архи', 'пиво', 'шар айраг', 'wine'], Wine],
    [['жимс', 'fruit'], Apple],
    [['чихэр', 'амттан', 'candy', 'шоколад'], Candy],
    [['талх', 'нарийн боов', 'жигнэмэг', 'бялуу'], Cookie],
    [['сүү', 'цагаан идээ', 'тараг', 'бяслаг'], Milk],
    [['мах', 'мах махан'], Beef],
    [['загас', 'тэнгисийн'], Fish],
    [['кофе', 'цай', 'coffee'], Coffee],
    [['хүнс', 'хоол', 'food', 'хүнсний'], Utensils],

    // ----- Office / books -----
    [['ном', 'book', 'сэтгүүл'], BookOpen],
    [['үзэг', 'бал', 'харандаа', 'дэвтэр'], PenTool],
    [['цаас', 'хэвлэх материал', 'дэвтэр '], FileText],
    [['бичиг хэрэг', 'оффис', 'office'], Briefcase],

    // ----- Generic helpers -----
    [['бэлэг', 'gift'], Gift],
    [['цахилгаан'], Plug],
    [['хэрэгсэл', 'дагалдах хэрэгсэл', 'accessor'], ShoppingBag],
];

/**
 * Return a lucide icon component for a (sub)category label, or `fallback`
 * (default: a neutral box) when nothing matches.
 * @param {string} label
 * @param {import('lucide-react').LucideIcon} [fallback]
 * @returns {import('lucide-react').LucideIcon}
 */
export function getSubcategoryIcon(label, fallback = Package) {
    const s = String(label || '').toLowerCase();
    if (!s) return fallback;
    for (const [keywords, Icon] of RULES) {
        for (const kw of keywords) {
            if (s.includes(kw)) return Icon;
        }
    }
    return fallback;
}

export default getSubcategoryIcon;
