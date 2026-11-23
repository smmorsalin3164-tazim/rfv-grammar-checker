function doPost(e) {
  try {
    var data = JSON.parse((e.postData && e.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('MAILER_SECRET');
    if (!expected || data.secret !== expected) {
      return output({ ok: false, error: 'Unauthorized' });
    }

    var to = String(data.to || '').trim();
    var name = String(data.name || '').trim();
    var code = String(data.code || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !name || !/^RFV-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(code)) {
      return output({ ok: false, error: 'Invalid email data' });
    }

    MailApp.sendEmail({
      to: to,
      subject: 'Your RFV Grammar Checker Access Code',
      body: 'Hello ' + name + ',\n\nYour RFV Grammar Checker Access Code is: ' + code +
        '\n\nOpen the RFV Grammar Checker website and enter this code to continue.' +
        '\n\nIf you did not request this code, you can ignore this email.',
      name: 'RFV Grammar Checker'
    });
    return output({ ok: true });
  } catch (err) {
    return output({ ok: false, error: String(err && err.message || err) });
  }
}

function output(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
