const CHURCH_EMAIL = 'aicegertonchapel@gmail.com';
const RESULT_MESSAGE = '<!doctype html><html><body><script>window.parent.postMessage({type:"aic-form-result",ok:RESULT_OK,message:RESULT_MESSAGE},"*");</script></body></html>';

function doPost(event) {
  const values = event && event.parameter ? event.parameter : {};
  const formType = clean(values.formType, 30);

  if (clean(values.website, 200)) {
    return resultPage(true, 'Message sent.');
  }

  try {
    let subject;
    let body;
    let replyTo;

    if (formType === 'contact') {
      const name = required(values.from_name, 'Name', 120);
      const phone = required(values.phone, 'Phone', 40);
      const email = required(values.from_email, 'Email', 254);
      const topic = required(values.subject, 'Subject', 180);
      const message = required(values.message, 'Message', 5000);
      const category = clean(values.category, 80) || 'General Inquiry';
      const followUp = clean(values.follow_up, 10) || 'Not specified';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
      if (!/^[+0-9()\s.-]+$/.test(phone)) throw new Error('Enter a valid phone number.');
      if (followUp !== 'Yes' && followUp !== 'No' && followUp !== 'Not specified') {
        throw new Error('Choose whether you would like a follow-up.');
      }
      subject = 'Website contact (' + category + '): ' + topic;
      body = 'Category: ' + category + '\nName: ' + name + '\nPhone: ' + phone +
        '\nEmail: ' + email + '\nFollow-up requested: ' + followUp + '\n\n' + message;
      replyTo = email;
    } else if (formType === 'ministry') {
      const name = required(values.name, 'Name', 120);
      const phone = required(values.phone, 'Phone', 40);
      const ministry = required(values.ministry, 'Ministry', 120);
      const age = clean(values.age, 3) || 'Not provided';
      const baptismYear = clean(values.baptismYear, 4) || 'Not provided';
      if (!/^[+0-9()\s.-]+$/.test(phone)) throw new Error('Enter a valid phone number.');
      subject = 'Website ministry application: ' + ministry;
      body = 'Name: ' + name + '\nPhone: ' + phone + '\nAge: ' + age +
        '\nMinistry: ' + ministry + '\nBaptism year: ' + baptismYear;
    } else {
      throw new Error('Unsupported form submission.');
    }

    GmailApp.sendEmail(CHURCH_EMAIL, subject, body, replyTo ? {replyTo: replyTo} : {});
    return resultPage(true, 'Message sent.');
  } catch (error) {
    console.error(error);
    return resultPage(false, error.message || 'Message delivery failed.');
  }
}

function clean(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLength);
}

function required(value, label, maxLength) {
  const result = clean(value, maxLength);
  if (!result) throw new Error(label + ' is required.');
  return result;
}

function resultPage(ok, message) {
  const safeMessage = JSON.stringify(String(message).slice(0, 300));
  const html = RESULT_MESSAGE
    .replace('RESULT_OK', ok ? 'true' : 'false')
    .replace('RESULT_MESSAGE', safeMessage);
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}