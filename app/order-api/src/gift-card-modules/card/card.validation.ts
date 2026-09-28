import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const ERROR_WHEN_CREATE_CARD = 'ERROR_WHEN_CREATE_CARD';
export const CARD_NOT_FOUND = 'CARD_NOT_FOUND';
export const ERROR_WHEN_UPDATE_CARD = 'ERROR_WHEN_UPDATE_CARD';
export const ERROR_WHEN_REMOVE_CARD = 'ERROR_WHEN_REMOVE_CARD';
export const CARD_IS_NOT_ACTIVE = 'CARD_IS_NOT_ACTIVE';
export const CARD_POINTS_ALREADY_EXISTS = 'CARD_POINTS_ALREADY_EXISTS';
export const CARD_TITLE_ALREADY_EXISTS = 'CARD_TITLE_ALREADY_EXISTS';
export const CARD_POINTS_NOT_EQUAL_TO_CARD_PRICE = 'CARD_POINTS_NOT_EQUAL_TO_CARD_PRICE';


export type TCardErrorCodeKey =
  | typeof ERROR_WHEN_CREATE_CARD
  | typeof CARD_NOT_FOUND
  | typeof ERROR_WHEN_UPDATE_CARD
  | typeof ERROR_WHEN_REMOVE_CARD
  | typeof CARD_IS_NOT_ACTIVE
  | typeof CARD_POINTS_ALREADY_EXISTS
  | typeof CARD_TITLE_ALREADY_EXISTS
  | typeof CARD_POINTS_NOT_EQUAL_TO_CARD_PRICE;

// 158001 - 158100
export type TCardErrorCode = Record<TCardErrorCodeKey, TErrorCodeValue>;

export const CardValidation: TCardErrorCode = {
  ERROR_WHEN_CREATE_CARD: createErrorCode(158001, 'Error when create card'),
  CARD_NOT_FOUND: createErrorCode(158002, 'Card not found'),
  ERROR_WHEN_UPDATE_CARD: createErrorCode(158003, 'Error when update card'),
  ERROR_WHEN_REMOVE_CARD: createErrorCode(158004, 'Error when remove card'),
  CARD_IS_NOT_ACTIVE: createErrorCode(158005, 'Card is not active'),
  CARD_POINTS_ALREADY_EXISTS: {
    code: 158006,
    message: 'Card points already exists'
  },
  CARD_TITLE_ALREADY_EXISTS: {
    code: 158007,
    message: 'Card title already exists'
  },
  CARD_POINTS_NOT_EQUAL_TO_CARD_PRICE: {
    code: 158008,
    message: 'Card points mus be equal to card price'
  }
};
