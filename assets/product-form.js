if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();
        this.form = this.querySelector('form');
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');

        this.quantityInputs = this.querySelectorAll('.product-form__quantity');
        this.quantityButtons = this.querySelectorAll('.quantity-button');
        this.quantityButtons.forEach(button => {
          button.addEventListener('click', this.handleQuantityButtonClick.bind(this));
        });

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      handleQuantityButtonClick(event) {
        const button = event.target;
        const input = button.parentNode.querySelector('.product-form__quantity');
        const currentValue = parseInt(input.value);

        if (button.classList.contains('plus')) {
          input.value = currentValue + 1;
        } else if (button.classList.contains('minus')) {
          input.value = Math.max(0, currentValue - 1);
        }
        input.dispatchEvent(new Event('change'));
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (evt.key === "Enter") {
          return false;
        }
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        const formData = new FormData(this.form);
        const items = [];
        let hasItems = false;

        console.log("Form Data:");
        for (let [key, value] of formData.entries()) {
          console.log(key, value);
        }

        // Check for single product quantity
        const singleQuantity = formData.get('quantity');
        if (singleQuantity && parseInt(singleQuantity) > 0) {
          console.log("Data Product ID:", this.form.dataset.productId);
          console.log("Form product-id field:", formData.get('product-id'));
          console.log("Form id field:", formData.get('id'));
          console.log("Form variant-id field:", formData.get('variant-id'));

          const variantId = formData.get('variant-id') || this.form.querySelector('input[name="variant-id"]')?.value;
          const productId = this.form.dataset.productId || formData.get('product-id') || formData.get('id');

          const selectedId = variantId || productId;

          console.log("Selected ID (Variant or Product):", selectedId);

          if (!selectedId) {
            console.error("Product or Variant ID is missing");
            this.handleErrorMessage("Unable to add product to cart. Product or Variant ID is missing.");
            return;
          }

          // If we have a product ID but no variant ID, fetch the first available variant
          if (!variantId && productId) {
            this.fetchFirstAvailableVariant(productId, parseInt(singleQuantity));
          } else {
            items.push({
              id: selectedId,
              quantity: parseInt(singleQuantity)
            });
            hasItems = true;
            this.addItemsToCart(items);
          }
        } else {
          // Check for multiple product variations
          for (let [key, value] of formData.entries()) {
            if (key.startsWith('items[') && key.endsWith('][quantity]')) {
              const id = key.match(/items\[(\d+)\]/)[1];
              const quantity = parseInt(value);
              if (quantity > 0) {
                items.push({ id, quantity });
                hasItems = true;
              }
            }
          }
          if (hasItems) {
            this.addItemsToCart(items);
          } else {
            console.log("no items selected");
          }
        }
      }

      fetchFirstAvailableVariant(productId, quantity) {
        fetch(`/products/${productId}.js`)
          .then(response => response.json())
          .then(productData => {
            const firstAvailableVariant = productData.variants.find(variant => variant.available) || productData.variants[0];
            if (firstAvailableVariant) {
              this.addItemsToCart([{ id: firstAvailableVariant.id, quantity: quantity }]);
            } else {
              this.handleErrorMessage("No available variants found for this product.");
            }
          })
          .catch(error => {
            console.error("Error fetching product data:", error);
            this.handleErrorMessage("An error occurred while adding the product to the cart.");
          });
      }

      addItemsToCart(items) {
        console.log("Items to be added:", items);

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        config.headers['Content-Type'] = 'application/json';

        const body = { items };

        if (this.cart) {
          body.sections = this.cart.getSectionsToRender().map((section) => section.id);
          body.sections_url = window.location.pathname;
        }

        config.body = JSON.stringify(body);

        console.log("Request body:", config.body);

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            console.log("API response:", response);
            if (response.status) {
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButton.querySelector('span').classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            }

            this.error = false;

            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    this.cart.renderContents(response);
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              this.cart.renderContents(response);
            }

            // Reset all variant quantities to 0
            this.resetVariantQuantities();
          })
          .catch((e) => {
            console.error("API error:", e);
            this.handleErrorMessage("An error occurred while adding the product to the cart.");
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      resetVariantQuantities() {
        const quantityInputs = this.form.querySelectorAll('.product-form__quantity');
        quantityInputs.forEach(input => {
          input.value = 0;
        });
      }
    }
  );
}