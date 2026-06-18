const normalizeVowels = (str) => {
    if (!str) return "";
    return str.toLowerCase().replace(/ө/g, 'о').replace(/ү/g, 'у').replace(/ё/g, 'е');
};

const engToMnMap = {
    'q': 'ч', 'w': 'ш', 'e': 'э', 'r': 'р', 't': 'т', 'y': 'ы', 'u': 'у', 'i': 'и', 'o': 'о', 'p': 'п', '[': 'ө', ']': 'ү',
    'a': 'а', 's': 'с', 'd': 'д', 'f': 'ф', 'g': 'г', 'h': 'х', 'j': 'ж', 'k': 'к', 'l': 'л', ';': 'б', "'": 'в',
    'z': 'з', 'x': 'й', 'c': 'ц', 'v': 'в', 'b': 'б', 'n': 'н', 'm': 'м', ',': 'ь', '.': 'ю', '/': 'я'
};

const convertEngToMn = (str) => {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        result += engToMnMap[str[i].toLowerCase()] || str[i];
    }
    return result;
};

export const smartSearchFilter = (products, term) => {
    if (!term || !products) return [];
    
    const lowerTerm = term.toLowerCase().trim();
    const searchTokens = lowerTerm.split(/\s+/).filter(t => t.length > 0);
    
    return products.filter(p => {
        const rawContent = `${p.name} ${p.name_mn || ""} ${p.englishName || ""} ${p.brand || ""} ${p.code || ""} ${p.description || ""} ${p.id}`.toLowerCase();
        const normalizedContent = normalizeVowels(rawContent);

        return searchTokens.every(t => {
            const tokenRaw = t.toLowerCase();
            const tokenNormalized = normalizeVowels(tokenRaw);
            const tokenMnConverted = normalizeVowels(convertEngToMn(tokenRaw));
            
            return rawContent.includes(tokenRaw) || 
                   normalizedContent.includes(tokenNormalized) || 
                   normalizedContent.includes(tokenMnConverted);
        });
    });
};
