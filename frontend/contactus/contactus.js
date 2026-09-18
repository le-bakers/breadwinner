/* ============================================
	 BreadWinner - Contact Page JS
	 ============================================ */

(function () {
	'use strict';

	const form = document.getElementById('contactForm');
	const status = document.getElementById('formStatus');
	if (!form || !status) return;

	const fields = [
		{ input: document.getElementById('contactName'), message: 'Please enter your name.' },
		{ input: document.getElementById('contactEmail'), message: 'Please enter a valid email address.', email: true },
		{ input: document.getElementById('contactTopic'), message: 'Please select a topic.' },
		{ input: document.getElementById('contactMessage'), message: 'Please tell us how we can help.' }
	];

	function validateField(field) {
		const wrapper = field.input.closest('.contact-field');
		const error = document.getElementById(field.input.id + '-error');
		const value = field.input.value.trim();
		const validEmail = !field.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
		const valid = value !== '' && validEmail;
		wrapper.classList.toggle('invalid', !valid);
		error.textContent = valid ? '' : field.message;
		return valid;
	}

	fields.forEach((field) => {
		field.input.addEventListener('blur', () => validateField(field));
		field.input.addEventListener('input', () => {
			if (field.input.closest('.contact-field').classList.contains('invalid')) validateField(field);
		});
	});

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		status.classList.remove('visible');
		if (!fields.every(validateField)) return;

		const name = fields[0].input.value.trim();
		form.reset();
		fields.forEach((field) => field.input.closest('.contact-field').classList.remove('invalid'));
		status.textContent = 'Thanks, ' + name + '. Your message is ready for our team, and we will get back to you within two business days.';
		status.classList.add('visible');
	});
})();
