class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  onChange(event) {
    this.updateQuantity(
      event.target.dataset.index,
      event.target.value,
      document.activeElement.getAttribute('name'),
      event.target.dataset.quantityVariantId
    );
  }

  onCartUpdate() {
    if (this.tagName === 'CART-DRAWER-ITEMS') {
      fetch(`${routes.cart_url}?section_id=cart-drawer`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
          for (const selector of selectors) {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          }
        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      fetch(`${routes.cart_url}?section_id=main-cart-items`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const sourceQty = html.querySelector('cart-items');
          this.innerHTML = sourceQty.innerHTML;
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items').dataset.id,
        selector: '.js-contents',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section',
      },
      {
        id: 'main-cart-footer',
        section: document.getElementById('main-cart-footer').dataset.id,
        selector: '.js-contents',
      },
    ];
  }

  updateQuantity(line, quantity, name, variantId) {
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        const quantityElement =
          document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
        const items = document.querySelectorAll('.cart-item');

        if (parsedState.errors) {
          quantityElement.value = quantityElement.getAttribute('value');
          this.updateLiveRegions(line, parsedState.errors);
          return;
        }

        this.classList.toggle('is-empty', parsedState.item_count === 0);
        const cartDrawerWrapper = document.querySelector('cart-drawer');
        const cartFooter = document.getElementById('main-cart-footer');

        if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
        if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

        this.getSectionsToRender().forEach((section) => {
          const elementToReplace =
            document.getElementById(section.id).querySelector(section.selector) || document.getElementById(section.id);
          elementToReplace.innerHTML = this.getSectionInnerHTML(
            parsedState.sections[section.section],
            section.selector
          );
        });
        const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
        let message = '';
        if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
          if (typeof updatedValue === 'undefined') {
            message = window.cartStrings.error;
          } else {
            message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
          }
        }
        this.updateLiveRegions(line, message);

        const lineItem =
          document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
        if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
          cartDrawerWrapper
            ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
            : lineItem.querySelector(`[name="${name}"]`).focus();
        } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
          trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
        } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
          trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
        }

        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: parsedState, variantId: variantId });
      })
      .catch(() => {
        this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        errors.textContent = window.cartStrings.error;
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-item__error-text').innerHTML = message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus =
      document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}



const customRepaint = function () {
  // alert('repaint-called whoo');
  document.querySelectorAll('#CartDrawer .loading__spinner').forEach(el => {
    el.classList.add('hidden');
  });
  document.querySelectorAll('#CartDrawer .loading__text').forEach(el => {
    el.classList.add('hidden');
  });
  document.querySelectorAll('#CartDrawer .totals').forEach(el => {
    el.classList.remove('hidden');
  });

  document.querySelectorAll('.price-swap').forEach(el => {
    el.classList.remove('hidden');
  });

  document.querySelectorAll('.variant-vals-wrapper').forEach(el => {

    let par = el.closest('td');
    //data-variant-id
    par.dataset.variantId;
    let curIn = document.querySelector('.size-inputs input[data-variant-id="' + par.dataset.variantId + '"]');
    if (curIn.value > 0) {
      el.classList.remove('opacity-zero');
    } else {
      el.classList.add('opacity-zero');
    }

  });

  updateQuantities();
  //update qtys
};


const variationInputs = document.querySelectorAll('.size-inputs input[type="number"]');


variationInputs.forEach(input => {


  input.addEventListener('change', function () {
    // Get the current value
    let totalCartQty = 0;
    let tempQty = 0;
    console.log(totalCartQty);

    let pts = document.querySelectorAll('.variant-price-table td');

    pts.forEach((pt) => {
      totalCartQty += parseInt(pt.dataset.cartquantity);
    });
    console.log(totalCartQty);

    variationInputs.forEach(vi => {
      console.log(vi.value);
      tempQty += parseInt(vi.value);
      vi.value = parseInt(vi.value);
      totalCartQty += parseInt(vi.value);
    })



    console.log(`Size ${this.closest('.size-input-group').querySelector('.size-label').textContent} changed to ${this.value}`);
    console.log('totalqty:', totalCartQty);
    console.log('tempqty:', tempQty);


    let curInput = this.closest('input');
    console.log(curInput.dataset);
    // data-cartquantity
    // data-variant-id


    let curTd = document.querySelector('.variant-price-table td[data-variant-id="' + curInput.dataset.variantId + '"]');
    if (curTd) {
      curTd.querySelector('.variation-quantity').innerText = curInput.value;

      if (curInput.value > 0) {
        curTd.querySelector('.variant-vals-wrapper').classList.remove('opacity-zero');
      } else {
        curTd.querySelector('.variant-vals-wrapper').classList.add('opacity-zero');
      }


      console.log(curTd.querySelector('.variant-vals-wrapper'));
    }


    if (sc_gqbreak_app_global.curr_qb_price_tiers) {
      console.log('price tiers found');

      let priceTiers = sc_gqbreak_app_global.curr_qb_price_tiers;

      priceTiers.forEach(tier => {
        console.log(tier);
        if (parseInt(totalCartQty) >= parseInt(tier.quantity)) {
          console.log('tier matched');
          console.log('TEMP TOTAL CART:', tempQty * tier.price);
          if (tempQty > 0) {
            document.querySelector('.temp-subtotal-submit').innerText = ' - $' + formatPrice(parseInt(tempQty) * parseFloat(tier.price))
            document.querySelectorAll('.variant-price-table .variation-price').forEach(el => { el.innerText = "$" + formatPrice(tier.price) + " " });
          } else {
            document.querySelector('.temp-subtotal-submit').innerText = "";
          }
        }
      });

      //calcuate temp totals for btn

    } else {
      const defaultPrice = formatPrice(parseFloat(selected_variant.price) * this.value / 100);
      console.log('TEMP TOTAL CART NO V:', defaultPrice);
      console.log(this);
      if (tempQty > 0) {
        document.querySelector('.temp-subtotal-submit').innerText = ' - $' + defaultPrice;
      } else {
        document.querySelector('.temp-subtotal-submit').innerText = "";
      }
    }
  });
});

function updateQuantities() {
  fetch('/cart.js')
    .then(response => response.json())
    .then(cart => {

      console.log('update-qty return', cart);
      if (cart.item_count == 0) {

        console.log('no items in cart');
        document.getElementById("cart-icon-bubble").innerHTML = `Cart <span aria-hidden="true">&nbsp;(0)</span>`;
      }
      const variantQuantities = {};

      // Create a map of variant IDs to quantities
      cart.items.forEach(item => {
        variantQuantities[item.variant_id] = item.quantity;
      });

      // Update quantities in the table

      if (document.querySelector('.variant-price-table td')) {
        const cells = document.querySelectorAll('.variant-price-table td');
        cells.forEach(cell => {
          const variantId = cell.dataset.variantId;
          cell.setAttribute('data-cartquantity', variantQuantities[variantId] || 0);
        });

        inputsIsoUpdate();
      } else {
        let sgs = document.querySelectorAll(".size-inputs input");
        let nullino = false;
        sgs.forEach((sg) => {
          console.log(sg.value);
          console.log(sg);
          if (sg.value > 0) {
            nullino = true;
          }
        })
        if (nullino) {
          console.log('keep current');
        } else {
          document.querySelector('.temp-subtotal-submit').innerText = "";
        }

      }

    })
    .catch(error => console.error('Error fetching cart:', error));

}

function inputsIsoUpdate() {
  console.log('iso');
  let totalCartQty = 0;
  let tempQty = 0;

  let pts = document.querySelectorAll('.variant-price-table td');
  pts.forEach((pt) => {
    totalCartQty += parseInt(pt.dataset.cartquantity);
  });

  variationInputs.forEach(vi => {
    console.log(vi.value);
    tempQty += parseInt(vi.value);
    vi.value = parseInt(vi.value);
    totalCartQty += parseInt(vi.value);
  })

  if (sc_gqbreak_app_global.curr_qb_price_tiers) {
    console.log('price tiers found');

    let priceTiers = sc_gqbreak_app_global.curr_qb_price_tiers;

    priceTiers.forEach(tier => {
      console.log(tier);
      if (parseInt(totalCartQty) >= parseInt(tier.quantity)) {
        console.log('tier matched');
        console.log('TEMP TOTAL CART:', tempQty * tier.price);
        if (tempQty > 0) {
          document.querySelector('.temp-subtotal-submit').innerText = '- $' + formatPrice(parseInt(tempQty) * parseFloat(tier.price));
          document.querySelectorAll('.variant-price-table .variation-price').forEach(el => { el.innerText = "$" + formatPrice(tier.price) + " " });
        } else {
          document.querySelector('.temp-subtotal-submit').innerText = "";
        }
      }
    });
  }
}

function formatPrice(price) {
  // Convert to a number if it's a string
  price = parseFloat(price);

  // Check if the price has decimal places
  if (price % 1 !== 0) {
    // If it has decimals, format to always show 2 decimal places
    return price.toFixed(2);
  } else {
    // If it's a whole number, return as is
    return price.toString();
  }
}

if (document.querySelector('.product-form form')) {
  document.querySelector('.product-form form').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      console.log('enter captured');
      e.preventDefault();
      return false;
    }
  });
}

