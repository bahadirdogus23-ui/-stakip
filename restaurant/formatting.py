from decimal import Decimal, InvalidOperation
import re


def money(cents):
    sign='−' if cents<0 else ''
    value=abs(cents)
    return f"{sign}{value//100:,}".replace(',','.')+f',{value%100:02d} TL'


def parse_money(text):
    value=text.strip().replace('₺','').replace(' ','')
    if ',' in value and '.' in value and not re.fullmatch(r'\d{1,3}(?:\.\d{3})*,\d{1,2}',value):
        raise ValueError('Binlik ve ondalık ayırıcılarını kontrol edin (ör. 1.250,50).')
    if ',' in value:
        value=value.replace('.','').replace(',','.')
    try:
        number=Decimal(value)
        if not number.is_finite() or number<0 or number>Decimal('999999999.99') or number*100!=(number*100).to_integral_value():
            raise ValueError()
        return int(number*100)
    except (InvalidOperation,ValueError,OverflowError):
        raise ValueError('Geçerli bir tutar girin (ör. 1250,50). En fazla iki ondalık basamak kullanın.')
