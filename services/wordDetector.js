const FORBIDDEN_WORDS = {
  dutch: {
    assurance: ['garanderen', 'verzekeren', 'waarborgen', 'verklaren', 'bevestigen', 'certificeren', 'valideren'],
    conclusions: ['wij concluderen', 'wij zijn van oordeel dat', 'wij vinden dat', 'wij hebben vastgesteld dat', 'wij geloven', 'u heeft.*nageleefd'],
    negative_assurance: [
      'ons is niets gebleken op grond waarvan wij zouden moeten concluderen dat',
      'niets dat wij hebben gereviewd geeft een indicatie dat',
      'gebaseerd op onze werkzaamheden hebben wij geen reden om aan te nemen dat'
    ],
    technical: ['controle', 'beoordeling', 'samenstellen'],
    absolutes: ['altijd', 'nooit', 'alle', 'geen', 'complete', 'geheel']
  },
  english: {
    assurance: ['guarantee', 'insure', 'assure', 'ensure', 'warrant', 'attest', 'verify', 'certify', 'validate'],
    conclusions: ['we conclude', 'we are of the opinion', 'in our opinion', 'we find', 'we found', 'we have determined', 'we believe', 'you comply with'],
    negative_assurance: [
      'nothing has come to our attention that causes us to believe',
      'nothing we reviewed indicated',
      'based on the procedures we performed.*we have no reason to believe that'
    ],
    technical: ['audit', 'review', 'compile'],
    absolutes: ['always', 'never', 'all', 'none', 'complete', 'entire']
  }
};

const RECOMMENDATIONS = {
  dutch: {
    assurance: 'Gebruik "verwachten" of "streven naar" in plaats van garantie-termen',
    conclusions: 'Vermijd conclusieve uitspraken, gebruik feitelijke observaties',
    negative_assurance: 'Vermijd negatieve assurance formuleringen',
    technical: 'Gebruik neutrale termen zoals "onderzoeken" of "analyseren"',
    absolutes: 'Vermijd absolute termen, gebruik relatieve formuleringen'
  },
  english: {
    assurance: 'Use "expect" or "aim to" instead of guarantee terms',
    conclusions: 'Avoid conclusive statements, use factual observations',
    negative_assurance: 'Avoid negative assurance formulations',
    technical: 'Use neutral terms like "examine" or "analyze"',
    absolutes: 'Avoid absolute terms, use relative formulations'
  }
};

class WordDetector {
  constructor() {
    this.patterns = this._compilePatterns();
  }

  _compilePatterns() {
    const patterns = {
      dutch: {},
      english: {}
    };

    // Compile patterns for each category and language
    for (const lang of ['dutch', 'english']) {
      for (const category in FORBIDDEN_WORDS[lang]) {
        patterns[lang][category] = FORBIDDEN_WORDS[lang][category].map(word => 
          new RegExp(`\\b${word}\\b`, 'gi')
        );
      }
    }

    return patterns;
  }

  _getContext(text, match, contextLength = 50) {
    const start = Math.max(0, match.index - contextLength);
    const end = Math.min(text.length, match.index + match[0].length + contextLength);
    return text.slice(start, end).trim();
  }

  _getRecommendation(language, category) {
    return RECOMMENDATIONS[language][category];
  }

  detect(text, pageNumber = 1) {
    const violations = [];
    const languages = ['dutch', 'english'];

    for (const lang of languages) {
      for (const category in this.patterns[lang]) {
        for (const pattern of this.patterns[lang][category]) {
          let match;
          while ((match = pattern.exec(text)) !== null) {
            violations.push({
              word: match[0],
              category,
              language,
              page: pageNumber,
              context: this._getContext(text, match),
              recommendation: this._getRecommendation(lang, category),
              explanation: this._getExplanation(lang, category)
            });
          }
        }
      }
    }

    return violations;
  }

  _getExplanation(language, category) {
    const explanations = {
      dutch: {
        assurance: 'Garantie-termen creëren een indruk van zekerheid die niet passend is',
        conclusions: 'Conclusieve uitspraken kunnen juridische verplichtingen creëren',
        negative_assurance: 'Negatieve assurance formuleringen kunnen verkeerd worden geïnterpreteerd',
        technical: 'Technische termen kunnen specifieke verwachtingen wekken',
        absolutes: 'Absolute termen zijn zelden accuraat en kunnen misleidend zijn'
      },
      english: {
        assurance: 'Guarantee terms create an impression of certainty that is not appropriate',
        conclusions: 'Conclusive statements can create legal obligations',
        negative_assurance: 'Negative assurance formulations can be misinterpreted',
        technical: 'Technical terms can create specific expectations',
        absolutes: 'Absolute terms are rarely accurate and can be misleading'
      }
    };

    return explanations[language][category];
  }
}

module.exports = new WordDetector(); 