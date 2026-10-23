const { addYears } = require('../utils/dates');

// risk_category (section 6.1.2)
function riskCategory({ triggeredCodes, occupationRisk, annualIncome, cfg }) {
  if (
    triggeredCodes.includes('PEP_MATCH') ||
    triggeredCodes.includes('SANCTIONS_POSSIBLE_MATCH') ||
    occupationRisk === 'HIGH'
  ) {
    return 'HIGH';
  }
  if (occupationRisk === 'MEDIUM' || Number(annualIncome) >= Number(cfg.medium_risk_income)) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function rekycDueDate(applicationDate, risk, cfg) {
  const years = cfg.rekyc_years[risk];
  return addYears(applicationDate, years);
}

module.exports = { riskCategory, rekycDueDate };
