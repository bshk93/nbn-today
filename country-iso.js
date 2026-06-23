// Shared country → ISO-3166 alpha-2 lookup and flag helper.
// Used by /draft and /players. Keep this the single source of truth —
// add new countries here, not in per-page copies.
window.COUNTRY_ISO = {
  'Antigua and Barbuda':              'AG',
  'Argentina':                        'AR',
  'Australia':                        'AU',
  'Austria':                          'AT',
  'Bahamas':                          'BS',
  'Belgium':                          'BE',
  'Benin':                            'BJ',
  'Bosnia and Herzegovina':           'BA',
  'Brazil':                           'BR',
  'Cameroon':                         'CM',
  'Canada':                           'CA',
  'China':                            'CN',
  'Croatia':                          'HR',
  'Czech Republic':                   'CZ',
  'Democratic Republic of the Congo': 'CD',
  'Denmark':                          'DK',
  'Dominican Republic':               'DO',
  'Egypt':                            'EG',
  'Estonia':                          'EE',
  'Finland':                          'FI',
  'France':                           'FR',
  'Gabon':                            'GA',
  'Georgia':                          'GE',
  'Germany':                          'DE',
  'Greece':                           'GR',
  'Guinea':                           'GN',
  'Haiti':                            'HT',
  'Israel':                           'IL',
  'Italy':                            'IT',
  'Jamaica':                          'JM',
  'Japan':                            'JP',
  'Latvia':                           'LV',
  'Lithuania':                        'LT',
  'Mali':                             'ML',
  'Mexico':                           'MX',
  'Montenegro':                       'ME',
  'New Zealand':                      'NZ',
  'Nigeria':                          'NG',
  'Poland':                           'PL',
  'Portugal':                         'PT',
  'Puerto Rico':                      'PR',
  'Russia':                           'RU',
  'Senegal':                          'SN',
  'Serbia':                           'RS',
  'Slovenia':                         'SI',
  'South Sudan':                      'SS',
  'Spain':                            'ES',
  'Sudan':                            'SD',
  'Sweden':                           'SE',
  'Switzerland':                      'CH',
  'Turkey':                           'TR',
  'USA':                              'US',
  'Ukraine':                          'UA',
  'United Kingdom':                   'GB',
};

// Returns an <img> flag element for the given country name, or null if unknown.
window.countryFlagImg = function (name) {
  const iso = window.COUNTRY_ISO[name];
  if (!iso) return null;
  const img = document.createElement('img');
  img.src = `https://flagcdn.com/16x12/${iso.toLowerCase()}.png`;
  img.alt = name;
  img.title = name;
  img.style.cssText = 'vertical-align:middle;border-radius:1px';
  return img;
};
