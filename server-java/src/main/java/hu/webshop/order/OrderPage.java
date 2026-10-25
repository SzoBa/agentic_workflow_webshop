package hu.webshop.order;

import java.util.List;

/**
 * A lapozott rendeléslista válaszburka.
 *
 * <p>Miért nem a {@code ProductPage} újrahasznosítása: annak van {@code categories}
 * mezője, ami rendelésnél értelmetlen. Beszivárogva a válaszba szerződéshiba lenne,
 * ezért a rendelésnek SAJÁT burka van — ugyanazokkal a lapozási metaadatokkal.
 *
 * @param <T> a listaelem nézettípusa ({@link AdminOrderView})
 */
public record OrderPage<T>(List<T> items, int total, int page, int pageSize, int totalPages) {
}
