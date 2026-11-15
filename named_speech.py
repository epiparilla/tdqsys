"""Private desktop name planning; never writes names into public queue state."""
import re
from speech_segments import ticket_plan

DEFAULTS = {
    'enabled': False,
    'nameTemplate': 'Test driver, {name}, you may now approach the registration area to test drive the {counter}.',
    'fallbackTemplate': 'Test driver, {ticket}, you may now approach the registration area to test drive the {counter}.',
    'callbackNameTemplate': 'Test driver, {name}, please stand by, you are next in line to test the {counter}.',
    'callbackFallbackTemplate': 'Test driver, {ticket}, please stand by, you are next in line to test the {counter}.'}


def validate_named(value):
    value = value if isinstance(value, dict) else {}
    result = {key: value.get(key, default) for key, default in DEFAULTS.items()}
    result['enabled'] = result['enabled'] is True
    for key, text in result.items():
        if key == 'enabled':
            continue
        required = 'ticket' if 'fallback' in key.lower() else 'name'
        if (not isinstance(text, str) or not text.strip() or len(text.strip()) > 600
                or '{' + required + '}' not in text
                or re.search(r'[{}]', re.sub(r'\{(?:name|ticket|counter|service)\}', '', text))
                or required == 'ticket' and '{name}' in text):
            raise ValueError('Invalid client-name announcement template: ' + key)
        result[key] = text.strip()
    return result


def named_plan(config, brand_key, unit, number, kind='ongoing', name=''):
    _, voice = ticket_plan(config, brand_key, unit, number, kind)
    settings = validate_named(config.get('namedAnnouncements'))
    brand = next(b for b in config['brands'] if b['key'] == brand_key)
    model = brand['models'][unit - 1]
    if not isinstance(name, str) or len(name) > 120:
        raise ValueError('Invalid client name.')
    name = ' '.join(name.split())
    key = ('callback' if kind == 'callback' else '') + ('NameTemplate' if name else 'FallbackTemplate')
    key = key[0].lower() + key[1:]
    values = {'name': name, 'ticket': (model.get('pronounce', '').strip() or ' '.join(model.get('prefix', ''))) + ' ' + ' '.join(str(number).zfill(2)),
              'counter': model.get('shortnamePronounce', '').strip() or model.get('label', ''), 'service': brand.get('name', '')}
    return [re.sub(r'\{(name|ticket|counter|service)\}', lambda match: values[match[1]], settings[key])], voice


def private_tickets(state, journal):
    config = state.get('config') or {}
    snapshot = journal.get('snapshot') or {}
    run = snapshot.get('run') or {}
    if (journal.get('instanceId') != config.get('instanceId') or not run.get('id')
            or run.get('status') != 'active' or run.get('instance_id', config.get('instanceId')) != config.get('instanceId')):
        return []
    models = {model['id']: model for model in snapshot.get('models', [])}
    result = []
    for entry in snapshot.get('entries', []):
        model = models.get(entry.get('vehicle_model_id'))
        if (not model or entry.get('status') not in ('waiting', 'ongoing') or entry.get('queue_run_id') != run['id']
                or entry.get('instance_id', config.get('instanceId')) != config.get('instanceId')):
            continue
        brand = next((b for b in config.get('brands', []) if b.get('key') == model.get('brand_key')), {})
        unit = model.get('unit_index')
        if type(unit) is not int or not 1 <= unit <= len(brand.get('models', [])) or brand['models'][unit-1].get('label') != model.get('full_name'):
            continue
        name = (entry.get('registrations') or {}).get('full_name', '')
        if isinstance(name, str) and name.strip() and len(name) <= 120:
            result.append({'brandKey': model['brand_key'], 'unit': unit, 'number': entry['queue_number'], 'clientName': name})
    return sorted(result, key=lambda item: (item['brandKey'], item['unit'], item['number'], item['clientName']))


def registration_warmup(config, tickets):
    # Every registered ticket fallback before any name, then optional batch warmup.
    for named in (False, True):
        for ticket in tickets:
            for kind in ('ongoing', 'callback'):
                yield named_plan(config, ticket['brandKey'], ticket['unit'], ticket['number'], kind, ticket['clientName'] if named else '')
