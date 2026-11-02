'use strict';
(() => {
  const form=document.getElementById('form'),message=document.getElementById('message');
  const dealership=form.elements.namedItem('dealership'),button=form.querySelector('button');
  const instanceId=new URL(location.href).searchParams.get('id') || '';
  let dealerships=[];
  async function loadDealerships() {
    button.disabled=true;dealership.disabled=true;
    try {
      const response=await fetch(`/api/test-drive/config?id=${encodeURIComponent(instanceId)}`,{cache:'no-store'});
      const config=await response.json();if(!response.ok)throw Error(config.error || 'Cannot load dealerships. Please reload.');
      dealerships=config.dealerships || [];
      dealership.replaceChildren(new Option('Select dealership',''),...dealerships.map(name=>new Option(name,name)));
      if(!dealerships.length)throw Error('Dealerships have not been configured. Please ask the facilitator to add them in desktop Settings.');
      dealership.disabled=false;button.disabled=false;
    }catch(error){message.className='error';message.textContent=error.message;}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    if(!dealerships.includes(dealership.value)){message.className='error';message.textContent='Select a dealership from the list.';return;}
    message.textContent='';button.disabled=true;
    try {
      const response=await fetch('/api/test-drive/se-checkins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instanceId,name:form.elements.namedItem('name').value,dealership:dealership.value})});
      const result=await response.json();if(!response.ok)throw Error(result.error || 'Registration failed.');
      message.className='success';message.textContent=`Your code is ${result.code}\n${result.message}`;form.hidden=true;
    }catch(error){message.className='error';message.textContent=error.message;}
    finally{button.disabled=false;}
  });
  loadDealerships();
})();
